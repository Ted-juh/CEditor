// WebViewProfileFolderTests — the WebView2 profile folders a webview gets, and the sweep of the ones
// left behind (WebViewProfileFolders.h). Every player window used to leave a profile in %TEMP% for
// good; what matters as much as removing those is never touching one a live process still uses.

#include "WebViewProfileFolders.h"
#include <iostream>

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
    const ProfileFolderName name { 4321, "0a1b2c3d", 7 };
    check (profileFolderName (name) == "p4321-0a1b2c3d-7", "written as p<pid>-<token>-<n>");
    const auto parsed = parseProfileFolderName ("p4321-0a1b2c3d-7");
    check (parsed && parsed->pid == 4321 && parsed->token == "0a1b2c3d" && parsed->counter == 7, "and read back");
    for (auto other : { "p4321-0a1b2c3d", "q4321-0a1b2c3d-7", "p43x1-0a1b2c3d-7", "p4321-XYZ-7", "p4321--7", "EBWebView" })
        check (! parseProfileFolderName (other), juce::String ("not one of ours: ") + other);
    check (isEarlierProfileFolderName ("1a2b3c4d5e_3"), "the earlier name, hex ticks _ counter");
    check (! isEarlierProfileFolderName ("p4321-0a1b2c3d-7") && ! isEarlierProfileFolderName ("notes_txt"), "is told apart");
}

static void rules()
{
    std::cout << "which folders are no longer anyone's\n";
    const auto now = juce::Time::getCurrentTime();
    SweepContext context { 100, "aaaaaaaa", [] (int pid) { return pid == 200; }, now };

    check (! isAbandoned ("p100-aaaaaaaa-1", now, context), "this process's own folder stays");
    check (isAbandoned ("p100-bbbbbbbb-1", now, context), "this process's id with another token: the id came round again, so its owner has gone");
    check (! isAbandoned ("p200-cccccccc-4", now, context), "a running process's folder stays");
    check (isAbandoned ("p300-cccccccc-4", now, context), "a gone process's folder goes");
    check (isAbandoned ("1a2b3c_2", now - juce::RelativeTime::days (31), context), "an earlier-named folder made over 30 days ago goes");
    check (! isAbandoned ("1a2b3c_2", now - juce::RelativeTime::days (2), context), "a recent one stays: an older build may still be running");
    check (! isAbandoned ("someone-elses", now - juce::RelativeTime::days (400), context), "anything not named like ours stays, however old");
    context.isRunning = nullptr;
    check (! isAbandoned ("p300-cccccccc-4", now, context), "with no way to ask, a process counts as running");
}

static void processes()
{
    std::cout << "is a process running\n";
    check (processIsRunning (currentProcessId()), "this one is");
    check (! processIsRunning (2'000'000'000), "an id no system hands out is not");
    check (! processIsRunning (0) && ! processIsRunning (-5), "nor is zero or below");
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
    auto own = make ("p100-aaaaaaaa-1");
    auto reused = make ("p100-bbbbbbbb-1");
    auto gone = make ("p300-cccccccc-1");
    auto live = make ("p200-dddddddd-2");
    auto recentEarlier = make ("1a2b3c_1");
    auto foreign = make ("notes");

    SweepContext context { 100, "aaaaaaaa", [] (int pid) { return pid == 200; }, juce::Time::getCurrentTime() };
    check (sweepProfileFolders (base, context, juce::RelativeTime::milliseconds (0)) == 0, "with no budget, nothing is taken");
    check (gone.exists() && reused.exists(), "so both abandoned folders are still there");

    check (sweepProfileFolders (base, context, juce::RelativeTime::seconds (10)) == 2, "with time, the two abandoned folders are removed");
    check (! gone.exists() && ! reused.exists(), "the gone process's and the reused id's");
    check (own.exists() && live.exists() && recentEarlier.exists() && foreign.exists(), "and nothing else");
    check (sweepProfileFolders (base.getChildFile ("missing"), context, juce::RelativeTime::seconds (1)) == 0, "a base that does not exist is nothing to do");
    base.deleteRecursively();
}

static void folderForNewWebView()
{
    std::cout << "a folder for a new webview\n";
    const auto app = "CEditorWebViewProfileTest_" + juce::String (currentProcessId());
    const auto first = profileFolderForNewWebView (app);
    const auto second = profileFolderForNewWebView (app);
    const auto a = parseProfileFolderName (first.getFileName());
    const auto b = parseProfileFolderName (second.getFileName());
    check (a && b, "named so a later sweep can tell whose it is");
    check (a && a->pid == currentProcessId(), "with this process's id");
    check (a && b && a->token == b->token && b->counter == a->counter + 1, "one token per process, a counter per webview");
    check (first.getParentDirectory() == juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (app), "under the app's folder in temp");
}

int main()
{
    names();
    rules();
    processes();
    sweep();
    folderForNewWebView();
    std::cout << (failures == 0 ? "All WebView profile folder tests passed.\n" : "FAILURES\n");
    return failures == 0 ? 0 : 1;
}
