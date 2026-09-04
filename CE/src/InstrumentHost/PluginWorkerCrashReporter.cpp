#include "PluginWorkerCrashReporter.h"
#include "PluginWorkerCrashDumps.h"

#include <atomic>
#include <cstdlib>
#include <exception>
#include <memory>
#include <string>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
 #include <dbghelp.h>
#endif

namespace ceditor::host::plugin_worker
{

#if JUCE_WINDOWS
namespace
{
struct CrashState
{
    std::wstring dumpPath;
    std::wstring metadataPath;
    std::string comment;
    std::string metadata;
    LPTOP_LEVEL_EXCEPTION_FILTER previousFilter = nullptr;
    std::terminate_handler previousTerminate = nullptr;
    volatile LONG writing = 0;
};

std::atomic<CrashState*> activeState { nullptr };

LONG WINAPI captureUnhandledException (EXCEPTION_POINTERS* exceptionPointers)
{
    auto* state = activeState.load (std::memory_order_acquire);
    if (state == nullptr
        || InterlockedCompareExchange (&state->writing, 1, 0) != 0)
        return EXCEPTION_EXECUTE_HANDLER;

    // Never let an older sidecar survive an unsuccessful overwrite of its dump slot.
    DeleteFileW (state->metadataPath.c_str());

    const auto file = CreateFileW (state->dumpPath.c_str(), GENERIC_WRITE, 0, nullptr,
                                   CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH,
                                   nullptr);
    if (file == INVALID_HANDLE_VALUE)
        return EXCEPTION_EXECUTE_HANDLER;

    MINIDUMP_EXCEPTION_INFORMATION exceptionInfo {};
    exceptionInfo.ThreadId = GetCurrentThreadId();
    exceptionInfo.ExceptionPointers = exceptionPointers;
    exceptionInfo.ClientPointers = FALSE;

    MINIDUMP_USER_STREAM commentStream {};
    commentStream.Type = CommentStreamA;
    commentStream.BufferSize = static_cast<ULONG> (state->comment.size());
    commentStream.Buffer = state->comment.data();
    MINIDUMP_USER_STREAM_INFORMATION userStreams {};
    userStreams.UserStreamCount = state->comment.empty() ? 0u : 1u;
    userStreams.UserStreamArray = state->comment.empty() ? nullptr : &commentStream;

    const auto dumpType = static_cast<MINIDUMP_TYPE> (
        MiniDumpNormal | MiniDumpWithThreadInfo | MiniDumpWithUnloadedModules);
    const auto wrote = MiniDumpWriteDump (
        GetCurrentProcess(), GetCurrentProcessId(), file, dumpType,
        exceptionPointers != nullptr ? &exceptionInfo : nullptr,
        userStreams.UserStreamCount != 0 ? &userStreams : nullptr, nullptr);
    FlushFileBuffers (file);
    CloseHandle (file);
    if (wrote == FALSE)
        DeleteFileW (state->dumpPath.c_str());
    else
    {
        const auto metadataFile = CreateFileW (
            state->metadataPath.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL | FILE_FLAG_WRITE_THROUGH, nullptr);
        if (metadataFile != INVALID_HANDLE_VALUE)
        {
            DWORD written = 0;
            const auto metadataBytes = static_cast<DWORD> (state->metadata.size());
            const auto metadataWritten = WriteFile (metadataFile, state->metadata.data(),
                                                     metadataBytes, &written, nullptr);
            FlushFileBuffers (metadataFile);
            CloseHandle (metadataFile);
            if (metadataWritten == FALSE || written != metadataBytes)
                DeleteFileW (state->metadataPath.c_str());
        }
    }
    return EXCEPTION_EXECUTE_HANDLER;
}

[[noreturn]] void terminateWithDump()
{
    constexpr DWORD unhandledCppException = 0xe043ce49u;
    RaiseException (unhandledCppException, EXCEPTION_NONCONTINUABLE, 0, nullptr);
    std::_Exit (74);
}
} // namespace
#endif

PluginWorkerCrashReporter::~PluginWorkerCrashReporter()
{
#if JUCE_WINDOWS
    auto* owned = static_cast<CrashState*> (state);
    if (owned == nullptr)
        return;

    auto* expected = owned;
    if (activeState.compare_exchange_strong (expected, nullptr, std::memory_order_acq_rel))
    {
        SetUnhandledExceptionFilter (owned->previousFilter);
        if (owned->previousTerminate != nullptr)
            std::set_terminate (owned->previousTerminate);
    }
    delete owned;
#endif
    state = nullptr;
}

bool PluginWorkerCrashReporter::install (const juce::File& dumpDirectory,
                                         juce::uint32 generation,
                                         const juce::String& pluginName,
                                         const juce::String& workerBuildSha256,
                                         juce::String& error)
{
    error.clear();
#if JUCE_WINDOWS
    if (state != nullptr)
        return true;
    if (generation == 0 || dumpDirectory == juce::File()
        || ! dumpDirectory.createDirectory())
    {
        error = "could not prepare the live-worker crash-dump directory";
        return false;
    }

    auto owned = std::make_unique<CrashState>();
    const auto processId = static_cast<juce::uint32> (GetCurrentProcessId());
    const auto slot = PluginWorkerCrashDumps::slotFor (generation, processId);
    owned->dumpPath = PluginWorkerCrashDumps::slotFile (dumpDirectory, slot)
                          .getFullPathName().toWideCharPointer();
    owned->metadataPath = PluginWorkerCrashDumps::metadataFile (dumpDirectory, slot)
                              .getFullPathName().toWideCharPointer();
    auto normalizedBuild = workerBuildSha256.trim().toLowerCase();
    if (normalizedBuild.length() != 64
        || ! normalizedBuild.containsOnly ("0123456789abcdef"))
        normalizedBuild = "unavailable";
    auto* context = new juce::DynamicObject();
    context->setProperty ("capturedBy", "Hostage live worker");
    context->setProperty ("generation", static_cast<juce::int64> (generation));
    context->setProperty ("processId", static_cast<juce::int64> (processId));
    context->setProperty ("slot", slot);
    context->setProperty ("plugin", pluginName.substring (0, 256));
    context->setProperty ("workerSha256", normalizedBuild);
    owned->comment = juce::JSON::toString (juce::var (context), true).toStdString();
    owned->metadata = owned->comment + "\n";

    auto* expected = static_cast<CrashState*> (nullptr);
    if (! activeState.compare_exchange_strong (expected, owned.get(),
                                                std::memory_order_acq_rel))
    {
        error = "a live-worker crash reporter is already installed";
        return false;
    }

    owned->previousFilter = SetUnhandledExceptionFilter (&captureUnhandledException);
    owned->previousTerminate = std::set_terminate (&terminateWithDump);
    state = owned.release();
    return true;
#else
    juce::ignoreUnused (dumpDirectory, generation, pluginName, workerBuildSha256);
    error = "live-worker minidumps are available on Windows only";
    return false;
#endif
}

void PluginWorkerCrashReporter::reinstall() noexcept
{
#if JUCE_WINDOWS
    auto* owned = static_cast<CrashState*> (state);
    if (owned == nullptr)
        return;

    const auto displaced = SetUnhandledExceptionFilter (&captureUnhandledException);
    if (displaced != &captureUnhandledException)
        owned->previousFilter = displaced;
    const auto displacedTerminate = std::set_terminate (&terminateWithDump);
    if (displacedTerminate != &terminateWithDump)
        owned->previousTerminate = displacedTerminate;
#endif
}

} // namespace ceditor::host::plugin_worker
