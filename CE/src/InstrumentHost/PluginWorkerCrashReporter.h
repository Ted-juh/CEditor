#pragma once

#include <juce_core/juce_core.h>

namespace ceditor::host::plugin_worker
{

/** Best-effort Windows minidump capture for an otherwise unhandled worker fault.

    Installation happens after the disposable process has joined its Windows Job Object and
    before any vendor format or plug-in code is loaded. The implementation deliberately lives
    in a .cpp linked only by worker executables, so Hostage itself never gains a DbgHelp runtime
    dependency merely to list existing dump files.
*/
class PluginWorkerCrashReporter
{
public:
    PluginWorkerCrashReporter() = default;
    ~PluginWorkerCrashReporter();

    PluginWorkerCrashReporter (const PluginWorkerCrashReporter&) = delete;
    PluginWorkerCrashReporter& operator= (const PluginWorkerCrashReporter&) = delete;

    bool install (const juce::File& dumpDirectory, juce::uint32 generation,
                  const juce::String& pluginName, const juce::String& workerBuildSha256,
                  juce::String& error);
    void reinstall() noexcept;
    bool isInstalled() const noexcept { return state != nullptr; }

private:
    void* state = nullptr;
};

} // namespace ceditor::host::plugin_worker
