// CTRL49 multi-knob page driving a real synth (Phase 5). Eight encoders drive eight
// assigned device parameters, shown as eight CEditor filmstrip knobs with labels+values;
// Page Left/Right switches assignment pages. This is the "a few knobs per synth" scenario
// and the first use of the assignment model (slot -> parameter bindings from a file).
//
// Usage:
//   Ctrl49MultiTest <assignment.json> <multiknob.lua> <knob_strip.png> <synth-port-name>
//
// Encoder e (0..127) scales linearly into each parameter's range for the synth send; the
// knob shows the encoder position. Windows-only. Connect the synth; close VIP / your DAW.

#ifdef _WIN32

#include "Ctrl49Assignment.h"
#include "Ctrl49PrivateInput.h"
#include "Ctrl49Reducer.h"
#include "Ctrl49Session.h"
#include "Ctrl49WinMmOutput.h"

#include "DeviceProfile/DeviceProfileEngine.h"

#include <windows.h>

#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <map>
#include <string>
#include <thread>

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

std::string toUtf8 (const std::wstring& w)
{
    std::string out;
    for (const wchar_t ch : w) out += static_cast<char> (ch < 128 ? ch : '?');
    return out;
}

std::string wideToUtf8 (const wchar_t* w)
{
    if (w == nullptr) return {};
    const int len = WideCharToMultiByte (CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
    if (len <= 1) return {};
    std::string out (static_cast<std::size_t> (len - 1), '\0');
    WideCharToMultiByte (CP_UTF8, 0, w, -1, out.data(), len, nullptr, nullptr);
    return out;
}

struct Range { int min = 0; int max = 127; };

int scaleToRange (int e, const Range& r)
{
    if (r.max <= r.min) return r.min;
    return r.min + static_cast<int> (std::lround (static_cast<double> (r.max - r.min) * e / 127.0));
}

// set_labels payload: [titleLen][title][ 8x [labelLen][label] ], all ASCII (<0x80).
Bytes buildLabelPayload (const AssignmentPage& page)
{
    auto appendString = [] (Bytes& out, const juce::String& s)
    {
        const juce::String ascii = s.substring (0, 255);
        out.push_back (static_cast<std::uint8_t> (ascii.length()));
        for (int i = 0; i < ascii.length(); ++i)
            out.push_back (static_cast<std::uint8_t> (ascii[i] & 0x7F));
    };

    Bytes out;
    appendString (out, page.title);
    for (const auto& slot : page.slots)
        appendString (out, slot.label);
    return out;
}
} // namespace

int wmain (int argc, wchar_t** argv)
{
    if (argc < 5)
    {
        std::printf ("usage: Ctrl49MultiTest <assignment.json> <multiknob.lua>"
                     " <knob_strip.png> <synth-port-name>\n");
        return 2;
    }

    // Assignment + profile.
    const juce::File assignmentFile (juce::String::fromUTF8 (wideToUtf8 (argv[1]).c_str()));
    Assignment assignment;
    juce::String error;
    if (! Assignment::fromFile (assignmentFile, assignment, error))
    {
        std::printf ("assignment load failed: %s\n", error.toRawUTF8());
        return 2;
    }
    logLine ("Assignment: " + std::string (assignment.name.toRawUTF8())
             + " (" + std::to_string (assignment.pages.size()) + " pages)");

    ceditor::device::DeviceProfileEngine engine;
    const juce::File profileFile = assignment.resolvedProfile (assignmentFile.getParentDirectory());
    if (! engine.loadFromFile (profileFile, error))
    {
        std::printf ("profile load failed (%s): %s\n",
                     profileFile.getFullPathName().toRawUTF8(), error.toRawUTF8());
        return 2;
    }
    logLine ("Profile: " + std::string (engine.getProfileName().toRawUTF8()));

    // Range map from the profile descriptors, for scaling the encoder into each param.
    std::map<juce::String, Range> ranges;
    {
        const juce::var descriptors = engine.listParameterDescriptors();
        if (const auto* arr = descriptors.getArray())
            for (const auto& d : *arr)
                if (auto* o = d.getDynamicObject())
                {
                    const juce::String id = o->getProperty ("id").toString();
                    Range r;
                    if (auto* rangeObj = o->getProperty ("range").getDynamicObject())
                    {
                        r.min = static_cast<int> (rangeObj->getProperty ("min"));
                        r.max = static_cast<int> (rangeObj->getProperty ("max"));
                    }
                    ranges[id] = r;
                }
    }

    // Verify every assigned parameter compiles before touching hardware.
    for (const auto& page : assignment.pages)
        for (const auto& slot : page.slots)
        {
            if (slot.parameterId.isEmpty()) continue;
            const Range r = ranges.count (slot.parameterId) ? ranges[slot.parameterId] : Range {};
            const auto probe = engine.compileSetParameter (assignment.deviceRole, slot.parameterId,
                                                           scaleToRange (64, r), false);
            if (! probe.ok)
            {
                std::printf ("parameter '%s' did not compile: %s\n",
                             slot.parameterId.toRawUTF8(), probe.error.toRawUTF8());
                return 2;
            }
        }
    logLine ("All assigned parameters compile.");

    // Load Lua + filmstrip.
    auto readFile = [] (const wchar_t* path, Bytes& out) -> bool
    {
        std::FILE* fp = _wfopen (path, L"rb");
        if (! fp) return false;
        std::fseek (fp, 0, SEEK_END); const long n = std::ftell (fp); std::fseek (fp, 0, SEEK_SET);
        out.resize (static_cast<std::size_t> (n));
        const bool ok = std::fread (out.data(), 1, static_cast<std::size_t> (n), fp) == static_cast<std::size_t> (n);
        std::fclose (fp);
        return ok;
    };
    Bytes rawLua, png;
    if (! readFile (argv[2], rawLua) || ! readFile (argv[3], png))
    { std::printf ("could not read Lua/PNG.\n"); return 2; }
    rawLua.push_back (0x00);

    const std::wstring synthPortName = argv[4];

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

        std::vector<Ctrl49Session::PngAsset> assets { { 0x0200, png } };
        Ctrl49SessionOptions options; options.log = logLine;
        Ctrl49Session session (ctrlOut, rawLua, assets, options);
        logLine ("Uploading multi-knob page + filmstrip, starting display...");
        session.start();

        Ctrl49Reducer reducer;
        reducer.setPageCount (static_cast<int> (assignment.pages.size()));

        auto sendLabels = [&] (int pageIndex)
        {
            session.callLua ("set_labels", buildLabelPayload (assignment.pages[static_cast<std::size_t> (pageIndex)]), false);
        };
        auto sendValues = [&] ()
        {
            const Bytes vals = reducer.displayArguments();
            Bytes payload; payload.reserve (9);
            payload.push_back (static_cast<std::uint8_t> (reducer.activeSlot()));
            for (int s = 0; s < 8; ++s) payload.push_back (vals[6 + static_cast<std::size_t> (s)]);
            session.callLua ("set_values", payload, true);
        };
        auto sendToSynth = [&] (int slot)
        {
            const auto& page = assignment.pages[static_cast<std::size_t> (reducer.page())];
            const auto& binding = page.slots[static_cast<std::size_t> (slot)];
            if (binding.parameterId.isEmpty()) return;
            const int e = reducer.displayArguments()[6 + static_cast<std::size_t> (slot)];
            const Range r = ranges.count (binding.parameterId) ? ranges[binding.parameterId] : Range {};
            const auto result = engine.compileSetParameter (assignment.deviceRole, binding.parameterId,
                                                           scaleToRange (e, r), false);
            if (! result.ok) return;
            for (const auto& msg : result.transaction.messages)
            {
                Bytes bytes; bytes.reserve (static_cast<std::size_t> (msg.bytes.size()));
                for (int b : msg.bytes) bytes.push_back (static_cast<std::uint8_t> (b & 0xFF));
                synthOut.send (bytes);
            }
        };

        int page = reducer.page();
        sendLabels (page);
        sendValues();
        logLine ("Ready. Encoders 1-8 -> parameters; Page Left/Right switches pages. Ctrl+C to stop.");

        auto lastSend = std::chrono::steady_clock::now();
        bool displayDirty = false;
        int pendingSlot = -1;

        while (! g_quit.load())
        {
            if (! session.failure().empty()) throw std::runtime_error (session.failure());
            if (! input.failure().empty())   throw std::runtime_error (input.failure());
            if (! input.running())           throw std::runtime_error ("hidden input stopped");

            for (auto message = input.dequeue(); message; message = input.dequeue())
            {
                const auto action = reducer.process (message->data(), message->size());
                if (! action) continue;
                if (action->render) displayDirty = true;
                const bool encoderMove = action->text.rfind ("Encoder ", 0) == 0
                                         || action->text.rfind ("Data Dial ", 0) == 0;
                if (encoderMove) pendingSlot = reducer.activeSlot();
            }

            if (reducer.page() != page)
            {
                page = reducer.page();
                sendLabels (page);
                pendingSlot = -1;  // do not blast the synth on a page switch
            }

            const auto now = std::chrono::steady_clock::now();
            if (displayDirty && now - lastSend >= std::chrono::milliseconds (20))
            {
                if (pendingSlot >= 0) { sendToSynth (pendingSlot); pendingSlot = -1; }
                sendValues();
                displayDirty = false;
                lastSend = now;
            }

            std::this_thread::sleep_for (std::chrono::milliseconds (2));
        }

        logLine ("Stopping...");
        session.stop();
        input.stop();
        logLine ("Multi-knob test stopped cleanly.");
    }
    catch (const std::exception& err)
    {
        std::printf ("ERROR: %s\n", err.what());
        ReleaseMutex (mutex); CloseHandle (mutex);
        return 1;
    }

    ReleaseMutex (mutex); CloseHandle (mutex);
    return 0;
}

#else // _WIN32

#include <cstdio>
int main() { std::printf ("Ctrl49MultiTest requires Windows.\n"); return 0; }

#endif // _WIN32
