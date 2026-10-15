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

    A folder is now named p<pid>-<start>-<module>-<n>: the process that made it and when that
    process started, a token the plug-in binary drew at random, and a counter. The first webview a
    binary makes sweeps the base folder of what is no longer anyone's: a folder whose process has
    gone, one with this process's id but another start (the id came round again, so its owner has
    gone), and one in the earlier name (hex ticks _ counter, from builds before this) made more than
    30 days ago. A live process's folders are never touched, whichever binary in it made them, and
    a folder the system will not let go of (WebView2 still has its files open) is left for the next
    sweep.

    Why the start time and not a token alone: a token is a static, and statics are per binary, so
    two different plug-ins in one DAW would each take the other's folders, under the same process
    id, for a dead process's. The start time is the same for every binary in a process.

    Synchronous, and bounded: the sweep stops taking folders once it has spent its budget, and the
    next process start carries on. A background thread would not wait on the window, but it could
    still be running when a host unloads the plug-in, which is a crash. */
juce::File profileFolderForNewWebView (const juce::String& appFolderName);

/*  SHARING ONE ENGINE, behind a switch. WebView2 runs one browser process (with its GPU, network and
    utility processes, about 200 MB in Chromium terms) per profile folder, so a folder per webview
    is an engine per plug-in copy. With CEDITOR_WEBVIEW2_SHARED=1 in the environment, every webview
    a plug-in binary makes in one process gets the same folder, p<pid>-<start>-<module>-0, and the
    copies of a panel in one DAW share an engine. A second binary (another panel, or the same panel
    as CLAP beside VST3) still gets its own, and so does every other process: the standalone, a
    sandboxed host's plug-in process. Off by default until it has been tried in DAWs on Windows,
    since a shared folder is what once blanked a second panel (docs/webview2-profiles.md). */
bool sharedEnginePerProcess();

// --- The pieces, for the tests ------------------------------------------------------------------

struct ProfileFolderName
{
    int pid = 0;
    juce::String processStart;   // hex
    juce::String module;         // hex, per binary
    juce::String instance;       // a counter, or 0: the binary's one shared folder (sharedEnginePerProcess)
};

juce::String profileFolderName (const ProfileFolderName&);
std::optional<ProfileFolderName> parseProfileFolderName (const juce::String& folderName);
bool isEarlierProfileFolderName (const juce::String& folderName);

int currentProcessId();
/** When this process started, as hex: the same in every binary loaded into it. */
juce::String currentProcessStart();
bool processIsRunning (int pid);

struct SweepContext
{
    int currentPid = 0;
    juce::String currentProcessStart;
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
