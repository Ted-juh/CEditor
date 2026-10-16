// WebViewEngineProbe — a DAW, as far as the player's webview can tell.
//
// The shared-engine switch (CEDITOR_WEBVIEW2_SHARED, WebViewProfileFolders.h) gives every webview
// one plug-in binary makes in one process the same WebView2 profile folder, so the copies of a panel
// in a DAW share one engine instead of starting about 200 MB of browser each. It is off by default
// because a shared folder is what once blanked a second panel, and what it waits on is somebody
// opening several copies in a host and watching them draw. This is that somebody: it loads an
// exported player plug-in several times in one process, opens every editor in a window of its own,
// and checks each panel came up — then does the things a session does to them.
//
//   1. open N copies, all windows at once;
//   2. close one window and reopen it while the others stay open;
//   3. close every window and reopen them all straight away, `cycles` times — with the switch on,
//      the new webviews ask for a folder whose engine may still be shutting down;
//   4. start a second process (this program again, one copy) while the windows are open, as the
//      standalone player beside a DAW would be.
//
// "Came up" is read from the player's own log (%TEMP%\ceditor-player-scripts.log): the editor logs
// its webview's profile folder when it opens, then "page ready" when the page answers and "panel
// shown" when the panel is in it. A webview that never started logs neither. On Windows it also
// counts the WebView2 engines (browser processes) this process owns and their memory, and checks
// the count is the number of profile folders in use: one with the switch, one per window without.
//
// Not a ctest: it needs an exported plug-in and a desktop. Build it with
// -DCEDITOR_WEBVIEW_ENGINE_PROBE=ON and run it twice, once with CEDITOR_WEBVIEW2_SHARED=1:
//
//   CEditorWebViewEngineProbe <player.vst3> [--copies 3] [--cycles 3] [--timeout 120]
//
// Exit code 0 when every stage passed.

#include "WebViewProfileFolders.h"

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <csignal>
#include <iostream>
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
#endif

namespace
{
int failures = 0;
juce::File reportFile;   // --report: the second process's lines, for the first to read

void say (const juce::String& line)
{
    std::cout << line << std::endl;
    if (reportFile != juce::File())
        reportFile.appendText (line + "\n");
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
        format.findAllTypesForFile (types, bundle.getFullPathName());
        if (types.isEmpty())
        {
            check (false, "found a plug-in in " + bundle.getFullPathName());
            return false;
        }
        for (size_t i = 0; i < copies.size(); ++i)
        {
            juce::String error;
            copies[i].plugin = format.createInstanceFromDescription (*types[0], 44100.0, 512, error);
            if (copies[i].plugin == nullptr)
            {
                check (false, "loaded copy " + juce::String ((int) i + 1) + ": " + error);
                return false;
            }
            copies[i].plugin->prepareToPlay (44100.0, 512);
        }
        say ("loaded " + juce::String ((int) copies.size()) + " copies of " + types[0]->name);
        return true;
    }

    void open (size_t i)
    {
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

        // The standalone beside a DAW: another process with the same panel, while these are open.
        // It reports through a file, not a pipe: on Linux the plug-in's webview forks, and the fork
        // would hold a pipe open after the second process had gone.
        const auto report = juce::File::createTempFile ("webview-engine-probe.txt");
        juce::ChildProcess second;
        const auto started = second.start (juce::StringArray { selfPath, bundle.getFullPathName(), "--child",
                                                               "--timeout", juce::String (timeout, 0),
                                                               "--report", report.getFullPathName() }, 0);
        check (started, "second process started");
        if (started)
        {
            const auto reported = [&] { return report.loadFileAsString().contains ("webview engine probe: "); };
            waitFor ([&] { return reported() || ! second.isRunning(); }, timeout + 30.0);
            const auto exited = waitFor ([&] { return ! second.isRunning(); }, 30.0);
            if (! exited)
                second.kill();
            for (const auto& line : juce::StringArray::fromLines (report.loadFileAsString()))
                if (line.isNotEmpty())
                    say ("    | " + line);
            check (report.loadFileAsString().contains ("webview engine probe: all stages passed"),
                   "second process showed its panel beside these");
            check (exited && second.getExitCode() == 0, "second process exited cleanly");
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
