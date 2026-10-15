#include "WebViewProfileFolders.h"

#include <algorithm>
#include <atomic>
#include <mutex>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #ifndef WIN32_LEAN_AND_MEAN
  #define WIN32_LEAN_AND_MEAN
 #endif
 #include <windows.h>
#else
 #include <cerrno>
 #include <signal.h>
 #include <unistd.h>
#endif

namespace ceditor::webview
{

juce::String profileFolderName (const ProfileFolderName& name)
{
    return "p" + juce::String (name.pid) + "-" + name.token + "-" + juce::String (name.counter);
}

std::optional<ProfileFolderName> parseProfileFolderName (const juce::String& folderName)
{
    if (! folderName.startsWithChar ('p'))
        return std::nullopt;
    auto parts = juce::StringArray::fromTokens (folderName.substring (1), "-", "");
    if (parts.size() != 3 || ! parts[0].containsOnly ("0123456789") || parts[0].isEmpty()
        || parts[1].isEmpty() || ! parts[1].containsOnly ("0123456789abcdef")
        || parts[2].isEmpty() || ! parts[2].containsOnly ("0123456789"))
        return std::nullopt;
    return ProfileFolderName { parts[0].getIntValue(), parts[1], parts[2].getIntValue() };
}

bool isEarlierProfileFolderName (const juce::String& folderName)
{
    // String::toHexString (Time::getHighResolutionTicks()) + "_" + counter.
    const auto underscore = folderName.indexOfChar ('_');
    if (underscore <= 0 || underscore == folderName.length() - 1)
        return false;
    return folderName.substring (0, underscore).containsOnly ("0123456789abcdef")
        && folderName.substring (underscore + 1).containsOnly ("0123456789");
}

int currentProcessId()
{
   #if JUCE_WINDOWS
    return (int) GetCurrentProcessId();
   #else
    return (int) getpid();
   #endif
}

bool processIsRunning (int pid)
{
    if (pid <= 0)
        return false;
   #if JUCE_WINDOWS
    if (auto process = OpenProcess (PROCESS_QUERY_LIMITED_INFORMATION, FALSE, (DWORD) pid))
    {
        DWORD code = 0;
        const bool running = GetExitCodeProcess (process, &code) && code == STILL_ACTIVE;
        CloseHandle (process);
        return running;
    }
    // A process we may not open is still a process; only "no such process" means it has gone.
    return GetLastError() != ERROR_INVALID_PARAMETER;
   #else
    return kill ((pid_t) pid, 0) == 0 || errno != ESRCH;
   #endif
}

bool isAbandoned (const juce::String& folderName, juce::Time created, const SweepContext& context)
{
    if (auto name = parseProfileFolderName (folderName))
    {
        if (name->pid == context.currentPid)
            return name->token != context.currentToken;
        return ! (context.isRunning ? context.isRunning (name->pid) : true);
    }
    if (isEarlierProfileFolderName (folderName))
        return context.now - created > context.earlierFolderAge;
    return false;   // not a profile folder of ours: leave it
}

int sweepProfileFolders (const juce::File& base, const SweepContext& context, juce::RelativeTime budget)
{
    if (! base.isDirectory())
        return 0;

    struct Candidate { juce::File folder; juce::Time created; };
    std::vector<Candidate> abandoned;
    for (const auto& entry : juce::RangedDirectoryIterator (base, false, "*", juce::File::findDirectories))
    {
        const auto folder = entry.getFile();
        const auto created = folder.getCreationTime();
        if (isAbandoned (folder.getFileName(), created, context))
            abandoned.push_back ({ folder, created });
    }
    std::sort (abandoned.begin(), abandoned.end(), [] (const auto& a, const auto& b) { return a.created < b.created; });

    const auto started = juce::Time::getMillisecondCounterHiRes();
    int removed = 0;
    for (const auto& candidate : abandoned)
    {
        if (juce::Time::getMillisecondCounterHiRes() - started >= (double) budget.inMilliseconds())
            break;
        if (candidate.folder.deleteRecursively() && ! candidate.folder.exists())
            ++removed;
    }
    return removed;
}

juce::File profileFolderForNewWebView (const juce::String& appFolderName)
{
    static const juce::String token = juce::String::toHexString ((int) juce::Random::getSystemRandom().nextInt())
                                          .toLowerCase().paddedLeft ('0', 8);
    static std::atomic<int> counter { 0 };
    static std::once_flag swept;

    const auto base = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (appFolderName);
    const auto pid = currentProcessId();

    std::call_once (swept, [&]
    {
        SweepContext context { pid, token, processIsRunning, juce::Time::getCurrentTime() };
        const auto removed = sweepProfileFolders (base, context, juce::RelativeTime::milliseconds (200));
        if (removed > 0)
            juce::Logger::writeToLog ("[webview] removed " + juce::String (removed)
                                      + " WebView2 profile folder(s) nothing uses any more from " + base.getFullPathName());
    });

    return base.getChildFile (profileFolderName ({ pid, token, ++counter }));
}

} // namespace ceditor::webview
