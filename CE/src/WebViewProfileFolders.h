#pragma once

#include <juce_core/juce_core.h>

#include <functional>
#include <optional>

namespace ceditor::webview
{

/*  A WebView2 profile folder for a webview about to be made, and an end to the ones left behind.

    The player (Player/PlayerHost.cpp) and the instrument host (InstrumentHost/HostRuntimeShared.h)
    give every webview a profile folder of its own in the temp directory, because WebView2 refused
    to share one: a fixed folder blanked the panel of a second user (a plug-in loaded while the
    standalone ran, or a second instance). Nothing deleted those folders, so every player window
    ever opened left a WebView2 profile behind in %TEMP%.

    A folder is now named p<pid>-<token>-<n>: the process that made it, a token that process drew at
    random, and a counter. The first webview a process makes sweeps the base folder of what is no
    longer anyone's: a folder whose process has gone, one with this process's id but another
    token (the id came round again, so its owner is gone), and one in the earlier name (hex
    ticks _ counter, from builds before this) that was made more than 30 days ago. A live process's
    folders are never touched, and a folder the system will not let go of (WebView2 still has its
    files open) is left for the next sweep.

    Synchronous, and bounded: the sweep stops taking folders once it has spent its budget, and the
    next process start carries on. A background thread would not wait on the window, but it could
    still be running when a host unloads the plug-in, which is a crash. */
juce::File profileFolderForNewWebView (const juce::String& appFolderName);

// --- The pieces, for the tests ------------------------------------------------------------------

struct ProfileFolderName
{
    int pid = 0;
    juce::String token;
    int counter = 0;
};

juce::String profileFolderName (const ProfileFolderName&);
std::optional<ProfileFolderName> parseProfileFolderName (const juce::String& folderName);
bool isEarlierProfileFolderName (const juce::String& folderName);

int currentProcessId();
bool processIsRunning (int pid);

struct SweepContext
{
    int currentPid = 0;
    juce::String currentToken;
    std::function<bool (int pid)> isRunning;
    juce::Time now;
    juce::RelativeTime earlierFolderAge = juce::RelativeTime::days (30);
};

/** Whether the folder called `folderName`, made at `created`, is no longer anyone's. */
bool isAbandoned (const juce::String& folderName, juce::Time created, const SweepContext&);

/** Deletes the abandoned folders under `base`, oldest first, until `budget` is spent. Returns how
    many it removed entirely. */
int sweepProfileFolders (const juce::File& base, const SweepContext&, juce::RelativeTime budget);

} // namespace ceditor::webview
