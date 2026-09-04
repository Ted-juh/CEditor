#pragma once

#include <juce_core/juce_core.h>
#include <utility>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
 // Windows' RPC headers expose `small` as a legacy macro, which collides with
 // juce::PushNotifications::Notification::BadgeIconType::small when JUCE GUI
 // headers are included after this worker helper.
 #ifdef small
  #undef small
 #endif
#endif

// A Windows Job Object is the OS-level lifetime/resource boundary around one live plug-in
// worker. Hostage owns the only long-lived handle. The worker joins the named job before it
// loads vendor code, then closes its temporary handle; closing/crashing Hostage therefore asks
// Windows to reap the entire worker job even if the worker's own watchdog is wedged.
//
// CPU and memory are intentionally not capped: a real-time plug-in cannot tolerate CPU
// throttling, and sample players legitimately use large address spaces. The bounded resource is
// process proliferation (one worker plus at most 63 vendor helpers), with no error-dialog pause.

namespace ceditor::host::plugin_worker
{

class PluginWorkerJob
{
public:
    static constexpr juce::uint32 maximumAssociatedProcesses = 64;

    PluginWorkerJob() = default;
    ~PluginWorkerJob() { close(); }

    PluginWorkerJob (const PluginWorkerJob&) = delete;
    PluginWorkerJob& operator= (const PluginWorkerJob&) = delete;

    PluginWorkerJob (PluginWorkerJob&& other) noexcept
    {
        handle = std::exchange (other.handle, nullptr);
        name = std::move (other.name);
    }

    PluginWorkerJob& operator= (PluginWorkerJob&& other) noexcept
    {
        if (this != &other)
        {
            close();
            handle = std::exchange (other.handle, nullptr);
            name = std::move (other.name);
        }
        return *this;
    }

    bool createHost (const juce::String& nameToUse, juce::String& error)
    {
        close();
        error.clear();
        if (nameToUse.isEmpty())
        {
            error = "invalid live-worker job name";
            return false;
        }

#if JUCE_WINDOWS
        const auto native = CreateJobObjectW (nullptr, nameToUse.toWideCharPointer());
        if (native == nullptr)
        {
            error = windowsError ("could not create the live-worker job", GetLastError());
            return false;
        }
        if (GetLastError() == ERROR_ALREADY_EXISTS)
        {
            CloseHandle (native);
            error = "refused a stale live-worker job name";
            return false;
        }

        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits {};
        limits.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_ACTIVE_PROCESS
            | JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION
            | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        limits.BasicLimitInformation.ActiveProcessLimit = maximumAssociatedProcesses;
        if (SetInformationJobObject (native, JobObjectExtendedLimitInformation,
                                     &limits, sizeof (limits)) == FALSE)
        {
            const auto code = GetLastError();
            CloseHandle (native);
            error = windowsError ("could not configure the live-worker job", code);
            return false;
        }

        handle = native;
        name = nameToUse;
        return true;
#else
        juce::ignoreUnused (nameToUse);
        error = "live-worker jobs are available on Windows only";
        return false;
#endif
    }

    static bool joinCurrentProcess (const juce::String& nameToUse, juce::String& error)
    {
        error.clear();
#if JUCE_WINDOWS
        if (nameToUse.isEmpty())
        {
            error = "invalid live-worker job name";
            return false;
        }

        const auto native = OpenJobObjectW (JOB_OBJECT_ASSIGN_PROCESS | JOB_OBJECT_QUERY,
                                            FALSE, nameToUse.toWideCharPointer());
        if (native == nullptr)
        {
            error = windowsError ("could not open the live-worker job", GetLastError());
            return false;
        }

        BOOL alreadyJoined = FALSE;
        const auto querySucceeded = IsProcessInJob (GetCurrentProcess(), native, &alreadyJoined);
        const auto joined = querySucceeded != FALSE && alreadyJoined != FALSE
                         ? TRUE
                         : AssignProcessToJobObject (native, GetCurrentProcess());
        const auto code = joined != FALSE ? ERROR_SUCCESS : GetLastError();

        // Hostage must own the only durable handle; otherwise KILL_ON_JOB_CLOSE would be kept
        // alive by the very worker it is meant to reap.
        CloseHandle (native);
        if (joined == FALSE)
        {
            error = windowsError ("could not join the live-worker job", code);
            return false;
        }
        return true;
#else
        juce::ignoreUnused (nameToUse);
        error = "live-worker jobs are available on Windows only";
        return false;
#endif
    }

    bool isOpen() const noexcept { return handle != nullptr; }
    const juce::String& getName() const noexcept { return name; }

    void close() noexcept
    {
#if JUCE_WINDOWS
        if (handle != nullptr)
            CloseHandle (static_cast<HANDLE> (handle));
#endif
        handle = nullptr;
        name.clear();
    }

private:
#if JUCE_WINDOWS
    static juce::String windowsError (const char* action, DWORD code)
    {
        return juce::String (action) + " (Windows error "
             + juce::String (static_cast<int> (code)) + ")";
    }
#endif

    void* handle = nullptr;
    juce::String name;
};

} // namespace ceditor::host::plugin_worker
