// WebViewEngineProbe — a DAW, as far as the player's webview can tell.
//
// Every webview one plug-in binary makes in one process gets the same WebView2 profile folder
// (WebViewProfileFolders.h), so the copies of a panel in a DAW share one engine instead of starting
// a browser each; CEDITOR_WEBVIEW2_SHARED=0 opts out. It was off by default until this probe showed
// it working, because a shared folder is what once blanked a second panel, and what it waited on was
// somebody opening several copies in a host and watching them draw. This is that somebody: it loads
// an exported player plug-in several times in one process, opens every editor in a window of its
// own, and checks each panel came up — then does the things a session does to them.
//
//   1. open N copies, all windows at once;
//   2. close one window and reopen it while the others stay open;
//   3. close every window and reopen them all straight away, `cycles` times — with the switch on,
//      the new webviews ask for a folder whose engine may still be shutting down;
//   4. start a second process (this program again, one copy) while the windows are open, as the
//      standalone player beside a DAW would be: once as a program started from Explorer is (no
//      console, no standard handles), once as one started from a terminal is (its output attached).
//      It says where it is before each step, so one that never finishes says where it stopped.
//      On Windows, one that has not finished in time is described before it is killed: every
//      thread's stack and CPU time, and how the machine (memory, CPU, the busiest processes) and the
//      process itself had been doing since it started, sampled every few seconds.
//
// "Came up" is read from the player's own log (%TEMP%\ceditor-player-scripts.log): the editor logs
// its webview's profile folder when it opens, then "page ready" when the page answers and "panel
// shown" when the panel is in it. A webview that never started logs neither. On Windows it also
// counts the WebView2 engines (browser processes) this process owns and their memory, and checks
// the count is the number of profile folders in use: one shared, one per window opted out.
//
// Not a ctest: it needs an exported plug-in and a desktop. Build it with
// -DCEDITOR_WEBVIEW_ENGINE_PROBE=ON and run it twice, once with CEDITOR_WEBVIEW2_SHARED=0:
//
//   CEditorWebViewEngineProbe <player.vst3> [--copies 3] [--cycles 3] [--timeout 120]
//
// Exit code 0 when every stage passed.

#include "WebViewProfileFolders.h"

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <csignal>
#include <iostream>
#include <algorithm>
#include <map>
#include <set>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
 #include <tlhelp32.h>
 #include <psapi.h>
 #include <dbghelp.h>
#endif

namespace
{
int failures = 0;
juce::File reportFile;   // --report: the second process's lines, for the first to read

void say (const juce::String& line)
{
    // The file first: the first process reads it, and a second process whose output nobody reads
    // can block writing that output.
    if (reportFile != juce::File())
        reportFile.appendText (line + "\n");
    std::cout << line << std::endl;
}

#if JUCE_WINDOWS
juce::uint64 ticks (const FILETIME& t) { return ((juce::uint64) t.dwHighDateTime << 32) | t.dwLowDateTime; }
#endif

/** "  .. 3.2 s  loading the plug-in": a line before each thing that can stop the process, so a
    second process that never finishes says where it stopped. On Windows the time is since the
    process started, which shows a process that was slow to reach its first line; elsewhere, since
    the first step. */
void step (const juce::String& what)
{
   #if JUCE_WINDOWS
    FILETIME created, exited, kernel, user, now;
    GetProcessTimes (GetCurrentProcess(), &created, &exited, &kernel, &user);
    GetSystemTimeAsFileTime (&now);
    const auto seconds = (double) (ticks (now) - ticks (created)) / 1.0e7;
   #else
    static const auto start = juce::Time::getMillisecondCounterHiRes();
    const auto seconds = (juce::Time::getMillisecondCounterHiRes() - start) / 1000.0;
   #endif
    say ("  .. " + juce::String (seconds, 1) + " s  " + what);
}

void check (bool condition, const juce::String& label)
{
    say ((condition ? "  PASS  " : "  FAIL  ") + label);
    if (! condition)
        ++failures;
}

/** Turns the message loop until `done` or `seconds` pass. Returns whether it got there. */
bool waitFor (const std::function<bool()>& done, double seconds)
{
    const auto until = juce::Time::getMillisecondCounterHiRes() + seconds * 1000.0;
    while (! done())
    {
        if (juce::Time::getMillisecondCounterHiRes() > until)
            return false;
        juce::MessageManager::getInstance()->runDispatchLoopUntil (50);
    }
    return true;
}

// --- The player's log -----------------------------------------------------------------------------

/** One "[webview]" line the player logged: which stage, and the profile folder it names. */
struct WebViewLine
{
    juce::String stage;     // "opened", "page ready", "panel shown"
    juce::String profile;
};

/** Reads what the player logs from where this probe started reading, keeping only the "[webview]"
    lines of webviews made by this process (their profile folder starts p<this pid>-): every process
    on the machine writes to the one file. */
class PlayerLog
{
public:
    PlayerLog() : file (juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile ("ceditor-player-scripts.log")),
                  marked (file.getSize()) {}

    /** Every line since `mark()` (or since the probe started). */
    std::vector<WebViewLine> sinceMark() const
    {
        std::vector<WebViewLine> lines;
        juce::FileInputStream in (file);
        if (! in.openedOk())
            return lines;
        in.setPosition (marked);
        const auto ownPrefix = "p" + juce::String (ceditor::webview::currentProcessId()) + "-";
        juce::StringArray text;
        text.addLines (in.readEntireStreamAsString());
        for (const auto& raw : text)
        {
            const auto at = raw.indexOf ("[webview] ");
            if (at < 0)
                continue;
            const auto body = raw.substring (at + 10);
            const auto profileAt = body.indexOf ("profile ");
            if (profileAt < 0)
            {
                if (body.startsWith ("opened"))
                    lines.push_back ({ "opened", {} });   // no webview at all, whoever's it is
                continue;
            }
            const auto profile = body.substring (profileAt + 8).upToFirstOccurrenceOf (",", false, false).trim();
            if (! profile.startsWith (ownPrefix))
                continue;
            lines.push_back ({ body.upToFirstOccurrenceOf (",", false, false).trim(), profile });
        }
        return lines;
    }

    void mark() { marked = file.getSize(); }

    static int count (const std::vector<WebViewLine>& lines, const juce::String& stage)
    {
        return (int) std::count_if (lines.begin(), lines.end(), [&] (const auto& l) { return l.stage == stage; });
    }

    static std::set<juce::String> profiles (const std::vector<WebViewLine>& lines, const juce::String& stage)
    {
        std::set<juce::String> out;
        for (const auto& l : lines)
            if (l.stage == stage)
                out.insert (l.profile);
        return out;
    }

private:
    juce::File file;
    juce::int64 marked = 0;
};

// --- WebView2's processes (Windows) ----------------------------------------------------------------

#if JUCE_WINDOWS
struct ProcessEntry
{
    DWORD pid = 0;
    DWORD parent = 0;
    juce::String name;
};

std::vector<ProcessEntry> allProcesses()
{
    std::vector<ProcessEntry> out;
    const auto snapshot = CreateToolhelp32Snapshot (TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE)
        return out;
    PROCESSENTRY32W entry {};
    entry.dwSize = sizeof (entry);
    for (auto ok = Process32FirstW (snapshot, &entry); ok; ok = Process32NextW (snapshot, &entry))
        out.push_back ({ entry.th32ProcessID, entry.th32ParentProcessID, juce::String (entry.szExeFile) });
    CloseHandle (snapshot);
    return out;
}

/** This process and everything it started, and what they started. */
std::vector<ProcessEntry> ownTree()
{
    const auto all = allProcesses();
    std::set<DWORD> inTree { GetCurrentProcessId() };
    for (bool grew = true; grew;)
    {
        grew = false;
        for (const auto& p : all)
            if (inTree.count (p.parent) != 0 && inTree.insert (p.pid).second)
                grew = true;
    }
    std::vector<ProcessEntry> out;
    for (const auto& p : all)
        if (inTree.count (p.pid) != 0)
            out.push_back (p);
    return out;
}

bool isWebView2 (const ProcessEntry& p) { return p.name.equalsIgnoreCase ("msedgewebview2.exe"); }

/** WebView2 engines: an msedgewebview2.exe in this process's tree whose parent is not one (its
    renderer, GPU and utility processes are children of the browser process). */
int webViewEngines()
{
    const auto tree = ownTree();
    std::set<DWORD> webViewPids;
    for (const auto& p : tree)
        if (isWebView2 (p))
            webViewPids.insert (p.pid);
    int engines = 0;
    for (const auto& p : tree)
        if (isWebView2 (p) && webViewPids.count (p.parent) == 0)
            ++engines;
    return engines;
}

/** Private memory of every WebView2 process in this process's tree, in MB. */
double webViewMegabytes()
{
    SIZE_T total = 0;
    for (const auto& p : ownTree())
    {
        if (! isWebView2 (p))
            continue;
        if (const auto handle = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, p.pid))
        {
            PROCESS_MEMORY_COUNTERS_EX counters {};
            if (GetProcessMemoryInfo (handle, reinterpret_cast<PROCESS_MEMORY_COUNTERS*> (&counters), sizeof (counters)))
                total += counters.PrivateUsage;
            CloseHandle (handle);
        }
    }
    return (double) total / (1024.0 * 1024.0);
}

// --- Where a stalled process is (Windows) ---------------------------------------------------------
//
// A second process that does not finish could be waiting on something (a lock, a pipe, another
// process) or starved along with everything else on the machine. These tell the two apart: what each
// of its threads is doing, how much CPU it has had, and how the machine was doing meanwhile.

/** CPU seconds a process has had, kernel and user. */
double cpuSeconds (HANDLE process)
{
    FILETIME created, exited, kernel, user;
    if (! GetProcessTimes (process, &created, &exited, &kernel, &user))
        return 0.0;
    return (double) (ticks (kernel) + ticks (user)) / 1.0e7;
}

double privateMegabytes (HANDLE process)
{
    PROCESS_MEMORY_COUNTERS_EX counters {};
    if (! GetProcessMemoryInfo (process, reinterpret_cast<PROCESS_MEMORY_COUNTERS*> (&counters), sizeof (counters)))
        return 0.0;
    return (double) counters.PrivateUsage / (1024.0 * 1024.0);
}

/** Samples the machine and one process every few seconds while it is waited for, and says what it
    saw if asked to: memory, commit and CPU of the machine, the process's CPU and memory, and at the
    end the processes that took the most CPU while it ran. */
class MachineSampler
{
public:
    explicit MachineSampler (DWORD watchedPid)
        : pid (watchedPid), started (juce::Time::getMillisecondCounterHiRes()), cpuAtStart (allCpu())
    {
        GetSystemTimes (&idle0, &kernel0, &user0);
        sample();
    }

    /** Called often; takes a sample when the last is old enough. */
    void tick()
    {
        if (juce::Time::getMillisecondCounterHiRes() - lastSample >= 3000.0)
            sample();
    }

    void report() const
    {
        say ("    machine and second process while it was waited for:");
        for (const auto& line : samples)
            say ("      " + line);
        say ("    processes with the most CPU in that time:");
        std::vector<std::pair<double, juce::String>> busiest;
        for (const auto& [id, now] : allCpu())
        {
            const auto before = cpuAtStart.count (id) != 0 ? cpuAtStart.at (id).first : 0.0;
            busiest.push_back ({ now.first - before, now.second + " (" + juce::String ((int) id) + ")" });
        }
        std::sort (busiest.begin(), busiest.end(), [] (const auto& a, const auto& b) { return a.first > b.first; });
        for (size_t i = 0; i < busiest.size() && i < 8; ++i)
            say ("      " + juce::String (busiest[i].first, 1) + " s  " + busiest[i].second);
    }

private:
    void sample()
    {
        lastSample = juce::Time::getMillisecondCounterHiRes();
        MEMORYSTATUSEX memory {};
        memory.dwLength = sizeof (memory);
        GlobalMemoryStatusEx (&memory);
        FILETIME idle, kernel, user;
        GetSystemTimes (&idle, &kernel, &user);
        const auto busy = (double) ((ticks (kernel) - ticks (kernel0)) + (ticks (user) - ticks (user0)));
        const auto spent = busy - (double) (ticks (idle) - ticks (idle0));   // kernel time includes idle
        const auto machineCpu = busy > 0.0 ? 100.0 * spent / busy : 0.0;
        idle0 = idle; kernel0 = kernel; user0 = user;
        const auto gb = [] (DWORDLONG bytes) { return juce::String ((double) bytes / (1024.0 * 1024.0 * 1024.0), 1); };
        auto line = juce::String ((lastSample - started) / 1000.0, 0) + " s: machine cpu " + juce::String (machineCpu, 0)
                  + "%, memory " + juce::String ((int) memory.dwMemoryLoad) + "% used, " + gb (memory.ullAvailPhys) + " GB free, commit "
                  + gb (memory.ullTotalPageFile - memory.ullAvailPageFile) + " of " + gb (memory.ullTotalPageFile) + " GB";
        if (const auto process = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid))
        {
            line << "; second process cpu " << juce::String (cpuSeconds (process), 1) << " s, private "
                 << juce::String (privateMegabytes (process), 0) << " MB";
            CloseHandle (process);
        }
        samples.add (line);
    }

    /** CPU seconds and name of every process that can be asked. */
    static std::map<DWORD, std::pair<double, juce::String>> allCpu()
    {
        std::map<DWORD, std::pair<double, juce::String>> out;
        for (const auto& p : allProcesses())
            if (const auto process = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, p.pid))
            {
                out[p.pid] = { cpuSeconds (process), p.name };
                CloseHandle (process);
            }
        return out;
    }

    DWORD pid;
    double started, lastSample = 0.0;
    std::map<DWORD, std::pair<double, juce::String>> cpuAtStart;
    FILETIME idle0 {}, kernel0 {}, user0 {};
    juce::StringArray samples;
};

/** Every thread of a process: its CPU time, and its stack as module!symbol+offset. Our own modules
    have their PDBs where they were built; system DLLs, the JVM's and CoreCLR's resolve to the
    nearest export, which still names the module and roughly where in it. */
void describeThreads (DWORD pid)
{
   #if defined (_M_X64)
    const auto process = OpenProcess (PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
    if (process == nullptr)
    {
        say ("    (could not open the second process to read its threads)");
        return;
    }
    SymSetOptions (SYMOPT_UNDNAME | SYMOPT_DEFERRED_LOADS | SYMOPT_FAIL_CRITICAL_ERRORS);
    SymInitializeW (process, nullptr, TRUE);
    using Description = HRESULT (WINAPI*) (HANDLE, PWSTR*);
    const auto describe = reinterpret_cast<Description> (reinterpret_cast<void*> (GetProcAddress (GetModuleHandleW (L"kernel32.dll"), "GetThreadDescription")));

    const auto snapshot = CreateToolhelp32Snapshot (TH32CS_SNAPTHREAD, 0);
    THREADENTRY32 entry {};
    entry.dwSize = sizeof (entry);
    for (auto ok = Thread32First (snapshot, &entry); ok; ok = Thread32Next (snapshot, &entry))
    {
        if (entry.th32OwnerProcessID != pid)
            continue;
        const auto thread = OpenThread (THREAD_SUSPEND_RESUME | THREAD_GET_CONTEXT | THREAD_QUERY_INFORMATION, FALSE, entry.th32ThreadID);
        if (thread == nullptr)
            continue;
        FILETIME created, exited, kernel, user;
        GetThreadTimes (thread, &created, &exited, &kernel, &user);
        juce::String name;
        PWSTR text = nullptr;
        if (describe != nullptr && SUCCEEDED (describe (thread, &text)) && text != nullptr)
        {
            name = juce::String (text);
            LocalFree (text);
        }
        say ("    thread " + juce::String ((int) entry.th32ThreadID) + (name.isNotEmpty() ? " \"" + name + "\"" : juce::String())
             + ", cpu " + juce::String ((double) (ticks (kernel) + ticks (user)) / 1.0e7, 2) + " s");

        SuspendThread (thread);
        CONTEXT context {};
        context.ContextFlags = CONTEXT_FULL;
        if (GetThreadContext (thread, &context))
        {
            STACKFRAME64 frame {};
            frame.AddrPC.Offset = context.Rip;    frame.AddrPC.Mode = AddrModeFlat;
            frame.AddrFrame.Offset = context.Rbp; frame.AddrFrame.Mode = AddrModeFlat;
            frame.AddrStack.Offset = context.Rsp; frame.AddrStack.Mode = AddrModeFlat;
            for (int depth = 0; depth < 24 && StackWalk64 (IMAGE_FILE_MACHINE_AMD64, process, thread, &frame, &context, nullptr,
                                                          SymFunctionTableAccess64, SymGetModuleBase64, nullptr); ++depth)
            {
                const auto address = frame.AddrPC.Offset;
                if (address == 0)
                    break;
                IMAGEHLP_MODULEW64 module {};
                module.SizeOfStruct = sizeof (module);
                const auto moduleName = SymGetModuleInfoW64 (process, address, &module) ? juce::String (module.ModuleName) : juce::String ("?");
                alignas (SYMBOL_INFO) char buffer[sizeof (SYMBOL_INFO) + 256] {};
                auto* symbol = reinterpret_cast<SYMBOL_INFO*> (buffer);
                symbol->SizeOfStruct = sizeof (SYMBOL_INFO);
                symbol->MaxNameLen = 255;
                DWORD64 displacement = 0;
                const auto where = SymFromAddr (process, address, &displacement, symbol)
                    ? juce::String (symbol->Name) + "+0x" + juce::String::toHexString ((juce::int64) displacement)
                    : "0x" + juce::String::toHexString ((juce::int64) (address - module.BaseOfImage));
                say ("        " + moduleName + "!" + where);
            }
        }
        ResumeThread (thread);
        CloseHandle (thread);
    }
    CloseHandle (snapshot);
    SymCleanup (process);
    CloseHandle (process);
   #else
    juce::ignoreUnused (pid);
   #endif
}

/** The process this one started from its own executable: the second process. */
DWORD childProbePid()
{
    wchar_t self[MAX_PATH] {};
    GetModuleFileNameW (nullptr, self, MAX_PATH);
    const auto name = juce::File (juce::String (self)).getFileName();
    for (const auto& p : allProcesses())
        if (p.parent == GetCurrentProcessId() && p.name.equalsIgnoreCase (name))
            return p.pid;
    return 0;
}
#endif

// --- The copies -----------------------------------------------------------------------------------

class EditorWindow final : public juce::DocumentWindow
{
public:
    EditorWindow (const juce::String& title, juce::AudioProcessorEditor* editor, int index)
        : juce::DocumentWindow (title, juce::Colours::black, 0)
    {
        setUsingNativeTitleBar (true);
        setContentOwned (editor, true);
        setTopLeftPosition (30 + 50 * index, 30 + 40 * index);
        setVisible (true);
    }

    void closeButtonPressed() override {}
};

struct Copy
{
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    std::unique_ptr<EditorWindow> window;
};

class Probe
{
public:
    Probe (juce::File pluginFile, int copiesToOpen, int closeReopenCycles, double secondsPerStage)
        : bundle (std::move (pluginFile)), copies ((size_t) copiesToOpen), cycles (closeReopenCycles), timeout (secondsPerStage) {}

    bool load()
    {
        juce::OwnedArray<juce::PluginDescription> types;
        step ("reading the plug-in module");
        format.findAllTypesForFile (types, bundle.getFullPathName());
        if (types.isEmpty())
        {
            check (false, "found a plug-in in " + bundle.getFullPathName());
            return false;
        }
        for (size_t i = 0; i < copies.size(); ++i)
        {
            juce::String error;
            step ("creating copy " + juce::String ((int) i + 1));
            copies[i].plugin = format.createInstanceFromDescription (*types[0], 44100.0, 512, error);
            if (copies[i].plugin == nullptr)
            {
                check (false, "loaded copy " + juce::String ((int) i + 1) + ": " + error);
                return false;
            }
            step ("preparing copy " + juce::String ((int) i + 1));
            copies[i].plugin->prepareToPlay (44100.0, 512);
        }
        say ("loaded " + juce::String ((int) copies.size()) + " copies of " + types[0]->name);
        return true;
    }

    void open (size_t i)
    {
        if (copies.size() == 1)
            step ("opening the window");
        auto* editor = copies[i].plugin->createEditorIfNeeded();
        copies[i].window = std::make_unique<EditorWindow> (copies[i].plugin->getName() + " " + juce::String ((int) i + 1), editor, (int) i);
    }

    void close (size_t i) { copies[i].window.reset(); }

    int openWindows() const
    {
        return (int) std::count_if (copies.begin(), copies.end(), [] (const auto& c) { return c.window != nullptr; });
    }

    /** Waits for `expected` panels to be shown since the log's mark, and checks what they say. */
    void expectShown (const juce::String& stage, int expected)
    {
        const auto shown = waitFor ([&] { return PlayerLog::count (log.sinceMark(), "panel shown") >= expected; }, timeout);
        const auto lines = log.sinceMark();
        const auto noWebView = (int) std::count_if (lines.begin(), lines.end(), [] (const auto& l) { return l.stage == "opened" && l.profile.isEmpty(); });
        check (noWebView == 0, stage + ": every window got a webview");
        check (shown, stage + ": " + juce::String (PlayerLog::count (lines, "panel shown")) + " of " + juce::String (expected)
                          + " panels shown within " + juce::String (timeout, 0) + " s");
        const auto profiles = PlayerLog::profiles (lines, "panel shown");
        for (const auto& p : profiles)
            say ("        profile " + p);
        if (shared && ! profiles.empty())
            check (profiles.size() == 1, stage + ": one profile folder for every window (switch on)");
    }

    /** With every window open: one engine per profile folder in use. */
    void expectEngines (const juce::String& stage)
    {
       #if JUCE_WINDOWS
        const int expected = shared ? 1 : openWindows();
        // An engine whose last window has closed takes a moment to exit.
        const auto settled = waitFor ([&] { return webViewEngines() == expected; }, 15.0);
        check (settled, stage + ": " + juce::String (webViewEngines()) + " WebView2 engine(s), expected " + juce::String (expected));
        say ("        WebView2 processes' private memory: " + juce::String (webViewMegabytes(), 0) + " MB");
       #else
        juce::ignoreUnused (stage);
       #endif
    }

    void run (const juce::String& selfPath, bool asChild)
    {
        shared = ceditor::webview::sharedEnginePerProcess();
        say (juce::String ("shared engine switch (CEDITOR_WEBVIEW2_SHARED): ") + (shared ? "on" : "off"));
        step ("looking for a desktop");
        if (juce::Desktop::getInstance().getDisplays().getPrimaryDisplay() == nullptr)
        {
            check (false, "a desktop to open the windows on (on Linux, DISPLAY: Xvfb will do)");
            return;
        }
        if (! load())
            return;

        const int n = (int) copies.size();
        log.mark();
        for (size_t i = 0; i < copies.size(); ++i)
            open (i);
        expectShown ("open " + juce::String (n), n);
        expectEngines ("open " + juce::String (n));
        if (asChild)
            return;

        if (n > 1)
        {
            log.mark();
            close (0);
            open (0);
            expectShown ("close one window and reopen it", 1);
            expectEngines ("close one window and reopen it");
        }

        for (int c = 1; c <= cycles; ++c)
        {
            log.mark();
            for (size_t i = 0; i < copies.size(); ++i)
                close (i);
            for (size_t i = 0; i < copies.size(); ++i)
                open (i);
            expectShown ("close all and reopen at once, cycle " + juce::String (c), n);
            expectEngines ("close all and reopen at once, cycle " + juce::String (c));
        }

        // The standalone beside a DAW: another process with the same panel, while these are open,
        // started both ways a standalone is: from Explorer or a shortcut (no console and no standard
        // handles at all), and from a terminal (its output attached).
        secondProcess (selfPath, "started like a program from Explorer", 0);
        secondProcess (selfPath, "started like a program from a terminal", juce::ChildProcess::wantStdOut | juce::ChildProcess::wantStdErr);
    }

    /** Runs this program again with one copy, while this one's windows are open. It reports through a
        file, not its output: on Linux the plug-in's webview forks, and the fork would hold a pipe open
        after the second process had gone (the output, when attached, is never read for that reason). */
    void secondProcess (const juce::String& selfPath, const juce::String& how, int streamFlags)
    {
        const auto report = juce::File::createTempFile ("webview-engine-probe.txt");
        juce::ChildProcess second;
        const auto started = second.start (juce::StringArray { selfPath, bundle.getFullPathName(), "--child",
                                                               "--timeout", juce::String (timeout, 0),
                                                               "--report", report.getFullPathName() }, streamFlags);
        check (started, "second process " + how + ": started");
        if (started)
        {
            const auto reported = [&] { return report.loadFileAsString().contains ("webview engine probe: "); };
           #if JUCE_WINDOWS
            const auto pid = childProbePid();
            MachineSampler sampler (pid);
            const auto finished = waitFor ([&] { sampler.tick(); return reported() || ! second.isRunning(); }, timeout + 30.0);
            if (! finished && pid != 0)
            {
                say ("  second process " + how + " (" + juce::String ((int) pid) + ") has not finished; where it is:");
                describeThreads (pid);
                sampler.report();
            }
           #else
            waitFor ([&] { return reported() || ! second.isRunning(); }, timeout + 30.0);
           #endif
            const auto exited = waitFor ([&] { return ! second.isRunning(); }, 30.0);
            if (! exited)
                second.kill();
            for (const auto& line : juce::StringArray::fromLines (report.loadFileAsString()))
                if (line.isNotEmpty())
                    say ("    | " + line);
            check (report.loadFileAsString().contains ("webview engine probe: all stages passed"),
                   "second process " + how + ": showed its panel beside these");
            check (exited && second.getExitCode() == 0, "second process " + how + ": exited cleanly"
                   + (exited ? " (exit code 0x" + juce::String::toHexString ((int) second.getExitCode()) + ")" : juce::String (" (killed)")));
        }
        report.deleteFile();
    }

    void tearDown()
    {
        for (auto& c : copies)
        {
            c.window.reset();
            if (c.plugin != nullptr)
                c.plugin->releaseResources();
            c.plugin.reset();
        }
    }

private:
    juce::File bundle;
    juce::VST3PluginFormat format;
    std::vector<Copy> copies;
    int cycles = 3;
    double timeout = 120.0;
    bool shared = false;
    PlayerLog log;
};

/*  Registered as an application, though its stages run from main(). JUCE treats a program as a
    host only when an application is registered: without it there is no XInitThreads and no X error
    handler on Linux, and the first X error a plug-in's window raised took the whole process down,
    which no DAW does. The stages are not run from inside the application's message loop, though,
    because they turn the loop themselves, and a loop turned from within one of its own callbacks
    is not how any host runs: on Linux the outer loop never dispatched again after them. */
class ProbeApp final : public juce::JUCEApplication
{
public:
    const juce::String getApplicationName() override    { return "CEditorWebViewEngineProbe"; }
    const juce::String getApplicationVersion() override { return "1"; }
    bool moreThanOneInstanceAllowed() override          { return true; }   // the second process is one
    void initialise (const juce::String&) override      {}
    void shutdown() override                            {}
};

juce::JUCEApplicationBase* createProbeApp() { return new ProbeApp(); }
} // namespace

int main (int argc, char* argv[])
{
    juce::StringArray args;
    for (int i = 1; i < argc; ++i)
        args.add (juce::String (juce::CharPointer_UTF8 (argv[i])));

    if (args.isEmpty() || args[0].startsWith ("-"))
    {
        say ("usage: CEditorWebViewEngineProbe <player.vst3> [--copies N] [--cycles N] [--timeout seconds]");
        return 2;
    }

    const auto option = [&] (const juce::String& name, int fallback)
    {
        const auto at = args.indexOf (name);
        return at >= 0 && at + 1 < args.size() ? args[at + 1].getIntValue() : fallback;
    };
    const bool asChild = args.contains ("--child");
    if (const auto at = args.indexOf ("--report"); at >= 0 && at + 1 < args.size())
        reportFile = juce::File (args[at + 1]);

   #if JUCE_LINUX
    // A webview whose child never started (no display) is a write to a closed pipe; ignored, as a
    // host would, it is a panel that never shows and a FAIL that says so, not a silent SIGPIPE.
    std::signal (SIGPIPE, SIG_IGN);
   #endif

    juce::JUCEApplicationBase::createInstance = &createProbeApp;
    juce::ScopedJuceInitialiser_GUI gui;
    const std::unique_ptr<juce::JUCEApplicationBase> app (juce::JUCEApplicationBase::createInstance());

    {
        Probe probe (juce::File (args[0]), asChild ? 1 : juce::jmax (1, option ("--copies", 3)), option ("--cycles", 3),
                     (double) juce::jmax (10, option ("--timeout", 120)));
        probe.run (juce::File::getSpecialLocation (juce::File::currentExecutableFile).getFullPathName(), asChild);
        probe.tearDown();
        // Let the plug-ins' windows and webviews finish going before the modules unload.
        waitFor ([] { return false; }, 1.0);
    }

    say (failures == 0 ? juce::String ("webview engine probe: all stages passed")
                       : "webview engine probe: " + juce::String (failures) + " check(s) failed");
    return failures == 0 ? 0 : 1;
}
