// WebViewProfileFolderTests — the WebView2 profile folders a webview gets, and the sweep of the ones
// left behind (WebViewProfileFolders.h). Every player window used to leave a profile in %TEMP% for
// good; what matters as much as removing those is never touching one a live process still uses.

#include "WebViewProfileFolders.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#if ! JUCE_WINDOWS
 #include <cstdlib>
#endif

using namespace ceditor::webview;

static int failures = 0;

static void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  ok    " : "  FAIL  ") << label << "\n";
    if (! cond) ++failures;
}

static void names()
{
    std::cout << "names\n";
    const ProfileFolderName name { 4321, "1d9a2b3c4d5e6f", "0a1b2c3d", "7" };
    check (profileFolderName (name) == "p4321-1d9a2b3c4d5e6f-0a1b2c3d-7", "written as p<pid>-<start>-<module>-<n>");
    const auto parsed = parseProfileFolderName ("p4321-1d9a2b3c4d5e6f-0a1b2c3d-7");
    check (parsed && parsed->pid == 4321 && parsed->processStart == "1d9a2b3c4d5e6f" && parsed->module == "0a1b2c3d"
               && parsed->instance == "7", "and read back");
    for (auto other : { "p4321-1d9a-0a1b2c3d", "q4321-1d9a-0a1b2c3d-7", "p43x1-1d9a-0a1b2c3d-7", "p4321-XYZ-0a1b2c3d-7",
                        "p4321--0a1b2c3d-7", "p4321-1d9a-0a1b2c3d-x", "EBWebView" })
        check (! parseProfileFolderName (other), juce::String ("not one of ours: ") + other);
    check (isEarlierProfileFolderName ("1a2b3c4d5e_3"), "the earlier name, hex ticks _ counter");
    check (! isEarlierProfileFolderName ("p4321-0a1b2c3d-7") && ! isEarlierProfileFolderName ("notes_txt"), "is told apart");
}

static void rules()
{
    std::cout << "which folders are no longer anyone's\n";
    const auto now = juce::Time::getCurrentTime();
    SweepContext context { 100, "5a5a", [] (int pid) { return pid == 200; }, now };

    check (! isAbandoned ("p100-5a5a-aaaaaaaa-1", now, context), "this binary's own folder stays");
    check (! isAbandoned ("p100-5a5a-bbbbbbbb-3", now, context),
           "so does another plug-in binary's in this same process: its module token differs, its process does not");
    check (isAbandoned ("p100-6b6b-aaaaaaaa-1", now, context), "this process's id with another start: the id came round again, so its owner has gone");
    check (! isAbandoned ("p200-7c7c-cccccccc-4", now, context), "a running process's folder stays");
    check (isAbandoned ("p300-7c7c-cccccccc-4", now, context), "a gone process's folder goes");
    check (isAbandoned ("1a2b3c_2", now - juce::RelativeTime::days (31), context), "an earlier-named folder made over 30 days ago goes");
    check (! isAbandoned ("1a2b3c_2", now - juce::RelativeTime::days (2), context), "a recent one stays: an older build may still be running");
    check (! isAbandoned ("someone-elses", now - juce::RelativeTime::days (400), context), "anything not named like ours stays, however old");
    context.isRunning = nullptr;
    check (! isAbandoned ("p300-7c7c-cccccccc-4", now, context), "with no way to ask, a process counts as running");
}

static void processes()
{
    std::cout << "is a process running\n";
    check (processIsRunning (currentProcessId()), "this one is");
    check (! processIsRunning (2'000'000'000), "an id no system hands out is not");
    check (! processIsRunning (0) && ! processIsRunning (-5), "nor is zero or below");
    check (currentProcessStart().isNotEmpty() && currentProcessStart() != "0", "this process has a start time");
    check (currentProcessStart() == currentProcessStart(), "and it does not change");
   #if JUCE_LINUX
    {
        // Read independently: field 22 of /proc/self/stat, the 20th after the command name. A field
        // that moves (memory, CPU time) would differ between two binaries in one process, and each
        // would then sweep the other's folders as a dead process's.
        std::ifstream file ("/proc/self/stat");
        std::string line;
        std::getline (file, line);
        std::istringstream rest (line.substr (line.rfind (')') + 2));
        std::string field;
        for (int i = 0; i < 20; ++i) rest >> field;
        check (currentProcessStart() == juce::String::toHexString ((juce::int64) std::stoull (field)).toLowerCase(),
               "it is the process's start time, field 22 of /proc/self/stat");
    }
   #endif
}

static void sweep()
{
    std::cout << "the sweep\n";
    auto base = juce::File::createTempFile ("ce-webview-sweep");
    base.createDirectory();
    const auto make = [&] (const juce::String& name)
    {
        auto folder = base.getChildFile (name);
        folder.getChildFile ("EBWebView/Default").createDirectory();
        folder.getChildFile ("EBWebView/Default/Preferences").replaceWithText ("{}");
        return folder;
    };
    auto own = make ("p100-5a5a-aaaaaaaa-1");
    auto otherBinary = make ("p100-5a5a-bbbbbbbb-1");
    auto reused = make ("p100-6b6b-aaaaaaaa-1");
    auto gone = make ("p300-7c7c-cccccccc-1");
    auto live = make ("p200-8d8d-dddddddd-2");
    auto recentEarlier = make ("1a2b3c_1");
    auto foreign = make ("notes");

    SweepContext context { 100, "5a5a", [] (int pid) { return pid == 200; }, juce::Time::getCurrentTime() };
    check (sweepProfileFolders (base, context, juce::RelativeTime::milliseconds (0)) == 0, "with no budget, nothing is taken");
    check (gone.exists() && reused.exists(), "so both abandoned folders are still there");

    check (sweepProfileFolders (base, context, juce::RelativeTime::seconds (10)) == 2, "with time, the two abandoned folders are removed");
    check (! gone.exists() && ! reused.exists(), "the gone process's and the reused id's");
    check (own.exists() && otherBinary.exists() && live.exists() && recentEarlier.exists() && foreign.exists(),
           "and nothing else, another binary's folder in this process included");
    check (sweepProfileFolders (base.getChildFile ("missing"), context, juce::RelativeTime::seconds (1)) == 0, "a base that does not exist is nothing to do");
    base.deleteRecursively();
}

static void setShared (bool on)
{
   #if JUCE_WINDOWS
    _putenv_s ("CEDITOR_WEBVIEW2_SHARED", on ? "1" : "");
   #else
    if (on) setenv ("CEDITOR_WEBVIEW2_SHARED", "1", 1); else unsetenv ("CEDITOR_WEBVIEW2_SHARED");
   #endif
}

static void folderForNewWebView()
{
    std::cout << "a folder for a new webview\n";
    // The default, whatever the environment running the test says: docs/webview2-profiles.md
    // has testers set the switch machine-wide.
    setShared (false);
    const auto app = "CEditorWebViewProfileTest_" + juce::String (currentProcessId());
    const auto first = profileFolderForNewWebView (app);
    const auto second = profileFolderForNewWebView (app);
    const auto a = parseProfileFolderName (first.getFileName());
    const auto b = parseProfileFolderName (second.getFileName());
    check (a && b, "named so a later sweep can tell whose it is");
    check (a && a->pid == currentProcessId() && a->processStart == currentProcessStart(), "with this process's id and start");
    check (a && b && a->module == b->module && b->instance.getIntValue() == a->instance.getIntValue() + 1,
           "one module token per binary, a counter per webview");
    check (first.getParentDirectory() == juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (app), "under the app's folder in temp");
}

static void sharedEngine()
{
    std::cout << "one engine per process, behind CEDITOR_WEBVIEW2_SHARED\n";
    const auto app = "CEditorWebViewProfileTest_" + juce::String (currentProcessId());
    setShared (false);
    check (! sharedEnginePerProcess(), "off unless the environment says so");
    check (profileFolderForNewWebView (app) != profileFolderForNewWebView (app), "and then each webview has a folder of its own");
    setShared (true);
    check (sharedEnginePerProcess(), "on with CEDITOR_WEBVIEW2_SHARED=1");
    const auto shared = profileFolderForNewWebView (app);
    check (shared == profileFolderForNewWebView (app), "every webview of this binary in this process then has the same one");
    const auto name = parseProfileFolderName (shared.getFileName());
    check (name && name->instance == "0" && name->pid == currentProcessId(), "instance 0, still named so the sweep knows whose it is");
    SweepContext context { currentProcessId(), currentProcessStart(), processIsRunning, juce::Time::getCurrentTime() };
    check (! isAbandoned (shared.getFileName(), juce::Time::getCurrentTime(), context), "and kept while the process runs");
    setShared (false);
}

int main()
{
    names();
    rules();
    processes();
    sweep();
    folderForNewWebView();
    sharedEngine();
    std::cout << (failures == 0 ? "All WebView profile folder tests passed.\n" : "FAILURES\n");
    return failures == 0 ? 0 : 1;
}
