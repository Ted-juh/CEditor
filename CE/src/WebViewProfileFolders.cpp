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
 #include <fstream>
 #include <string>
 #if JUCE_MAC
  #include <sys/sysctl.h>
 #endif
#endif

namespace ceditor::webview
{

juce::String profileFolderName (const ProfileFolderName& name)
{
    return "p" + juce::String (name.pid) + "-" + name.processStart + "-" + name.module + "-" + name.instance;
}

std::optional<ProfileFolderName> parseProfileFolderName (const juce::String& folderName)
{
    if (! folderName.startsWithChar ('p'))
        return std::nullopt;
    auto parts = juce::StringArray::fromTokens (folderName.substring (1), "-", "");
    const auto hex = [] (const juce::String& s) { return s.isNotEmpty() && s.containsOnly ("0123456789abcdef"); };
    const auto digits = [] (const juce::String& s) { return s.isNotEmpty() && s.containsOnly ("0123456789"); };
    if (parts.size() != 4 || ! digits (parts[0]) || ! hex (parts[1]) || ! hex (parts[2]) || ! digits (parts[3]))
        return std::nullopt;
    return ProfileFolderName { parts[0].getIntValue(), parts[1], parts[2], parts[3] };
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

juce::String currentProcessStart()
{
    static const juce::String start = []
    {
        juce::uint64 value = 0;
       #if JUCE_WINDOWS
        FILETIME created {}, exited {}, kernel {}, user {};
        if (GetProcessTimes (GetCurrentProcess(), &created, &exited, &kernel, &user))
            value = ((juce::uint64) created.dwHighDateTime << 32) | created.dwLowDateTime;
       #elif JUCE_MAC
        int mib[4] = { CTL_KERN, KERN_PROC, KERN_PROC_PID, (int) getpid() };
        struct kinfo_proc info {};
        size_t size = sizeof (info);
        if (sysctl (mib, 4, &info, &size, nullptr, 0) == 0)
            value = (juce::uint64) info.kp_proc.p_starttime.tv_sec * 1000000u + (juce::uint64) info.kp_proc.p_starttime.tv_usec;
       #else
        // Field 22 of /proc/self/stat, the clock ticks since boot at which the process started;
        // counted from after the command name, which can hold spaces and parentheses itself. Read
        // with a stream: a /proc file reports a size of 0, so File::loadFileAsString reads nothing.
        std::string line;
        std::ifstream file ("/proc/self/stat");
        std::getline (file, line);
        const juce::String stat (line);
        const auto fields = juce::StringArray::fromTokens (stat.fromLastOccurrenceOf (")", false, false).trim(), " ", "");
        if (fields.size() > 19)
            value = (juce::uint64) fields[19].getLargeIntValue();
       #endif
        return juce::String::toHexString ((juce::int64) value).toLowerCase();
    }();
    return start;
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
            return name->processStart != context.currentProcessStart;
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

bool sharedEnginePerProcess()
{
    return juce::SystemStats::getEnvironmentVariable ("CEDITOR_WEBVIEW2_SHARED", {}).trim() == "1";
}

juce::File profileFolderForNewWebView (const juce::String& appFolderName)
{
    // Per binary (statics are), which is all it is for: telling apart the folders two plug-ins in
    // one process make. The sweep goes by the process alone.
    static const juce::String module = juce::String::toHexString ((int) juce::Random::getSystemRandom().nextInt())
                                           .toLowerCase().paddedLeft ('0', 8);
    static std::atomic<int> counter { 0 };
    static std::once_flag swept;

    const auto base = juce::File::getSpecialLocation (juce::File::tempDirectory).getChildFile (appFolderName);
    const auto pid = currentProcessId();

    std::call_once (swept, [&]
    {
        SweepContext context { pid, currentProcessStart(), processIsRunning, juce::Time::getCurrentTime() };
        const auto removed = sweepProfileFolders (base, context, juce::RelativeTime::milliseconds (200));
        if (removed > 0)
            juce::Logger::writeToLog ("[webview] removed " + juce::String (removed)
                                      + " WebView2 profile folder(s) nothing uses any more from " + base.getFullPathName());
    });

    // Instance 0 is this binary's shared folder; the counter starts at 1, so the two never meet.
    const auto instance = sharedEnginePerProcess() ? juce::String (0) : juce::String (++counter);
    return base.getChildFile (profileFolderName ({ pid, currentProcessStart(), module, instance }));
}

} // namespace ceditor::webview
