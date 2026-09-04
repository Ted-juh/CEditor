#include "PluginWorkerSharedMemory.h"
#include <utility>

#if JUCE_WINDOWS
 #ifndef NOMINMAX
  #define NOMINMAX
 #endif
 #include <windows.h>
#endif

namespace ceditor::host::plugin_worker
{

SharedMemoryNames SharedMemoryNames::createUnique()
{
    const auto id = juce::Uuid().toString().removeCharacters ("-");
    const auto stem = "Local\\HostagePlugin-" + id;
    return { stem + "-data", stem + "-input", stem + "-output", stem + "-control" };
}

bool SharedMemoryNames::isValid() const noexcept
{
    return mapping.isNotEmpty() && inputReady.isNotEmpty() && outputReady.isNotEmpty()
        && controlPipe.isNotEmpty()
        && mapping != inputReady && mapping != outputReady && inputReady != outputReady
        && controlPipe != mapping && controlPipe != inputReady && controlPipe != outputReady;
}

SharedDataPlaneMapping::~SharedDataPlaneMapping()
{
    close();
}

SharedDataPlaneMapping::SharedDataPlaneMapping (SharedDataPlaneMapping&& other) noexcept
{
    moveFrom (std::move (other));
}

SharedDataPlaneMapping& SharedDataPlaneMapping::operator= (SharedDataPlaneMapping&& other) noexcept
{
    if (this != &other)
    {
        close();
        moveFrom (std::move (other));
    }
    return *this;
}

void SharedDataPlaneMapping::moveFrom (SharedDataPlaneMapping&& other) noexcept
{
    resourceNames = std::move (other.resourceNames);
    mappingHandle = std::exchange (other.mappingHandle, nullptr);
    inputEventHandle = std::exchange (other.inputEventHandle, nullptr);
    outputEventHandle = std::exchange (other.outputEventHandle, nullptr);
    mappedMemory = std::exchange (other.mappedMemory, nullptr);
    mappedBytes = std::exchange (other.mappedBytes, 0);
    plane = other.plane;
    other.plane = {};
}

#if JUCE_WINDOWS
namespace
{
juce::String windowsError (const char* action)
{
    return juce::String (action) + " (Windows error "
         + juce::String (static_cast<int> (GetLastError())) + ")";
}

HANDLE handleOf (void* value) noexcept { return static_cast<HANDLE> (value); }

size_t mappedRegionBytes (void* memory) noexcept
{
    MEMORY_BASIC_INFORMATION info {};
    return VirtualQuery (memory, &info, sizeof (info)) == sizeof (info) ? info.RegionSize : 0;
}

WaitResult waitFor (void* handle, int timeoutMs) noexcept
{
    if (handle == nullptr)
        return WaitResult::failed;
    const auto timeout = timeoutMs < 0 ? INFINITE : static_cast<DWORD> (timeoutMs);
    switch (WaitForSingleObject (handleOf (handle), timeout))
    {
        case WAIT_OBJECT_0: return WaitResult::signalled;
        case WAIT_TIMEOUT:  return WaitResult::timedOut;
        default:            return WaitResult::failed;
    }
}
} // namespace
#endif

bool SharedDataPlaneMapping::createHost (const SharedMemoryNames& namesToUse,
                                         const DataPlaneConfig& config,
                                         juce::uint32 generation,
                                         juce::String& error)
{
    close();
    error.clear();
    const auto bytes = requiredDataPlaneBytes (config);
    if (! namesToUse.isValid() || generation == 0 || bytes == 0)
    {
        error = "invalid live-worker mapping configuration";
        return false;
    }

#if JUCE_WINDOWS
    resourceNames = namesToUse;
    mappingHandle = CreateFileMappingW (INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                        static_cast<DWORD> (bytes >> 32),
                                        static_cast<DWORD> (bytes & 0xffffffffu),
                                        resourceNames.mapping.toWideCharPointer());
    if (mappingHandle == nullptr)
    {
        error = windowsError ("could not create plug-in shared memory");
        close();
        return false;
    }
    if (GetLastError() == ERROR_ALREADY_EXISTS)
    {
        error = "refused a stale plug-in shared-memory name";
        close();
        return false;
    }

    mappedMemory = MapViewOfFile (handleOf (mappingHandle), FILE_MAP_ALL_ACCESS, 0, 0, bytes);
    if (mappedMemory == nullptr)
    {
        error = windowsError ("could not map plug-in shared memory");
        close();
        return false;
    }
    mappedBytes = bytes;

    inputEventHandle = CreateEventW (nullptr, FALSE, FALSE,
                                     resourceNames.inputReady.toWideCharPointer());
    if (inputEventHandle == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        error = inputEventHandle == nullptr ? windowsError ("could not create input event")
                                            : "refused a stale plug-in input-event name";
        close();
        return false;
    }
    outputEventHandle = CreateEventW (nullptr, FALSE, FALSE,
                                      resourceNames.outputReady.toWideCharPointer());
    if (outputEventHandle == nullptr || GetLastError() == ERROR_ALREADY_EXISTS)
    {
        error = outputEventHandle == nullptr ? windowsError ("could not create output event")
                                             : "refused a stale plug-in output-event name";
        close();
        return false;
    }

    plane = DataPlaneView::initialise (mappedMemory, mappedBytes, config, generation);
    if (! plane)
    {
        error = "could not initialise plug-in shared-memory layout";
        close();
        return false;
    }
    return true;
#else
    juce::ignoreUnused (namesToUse, config, generation, bytes);
    error = "live plug-in worker mappings are currently implemented for Windows only";
    return false;
#endif
}

bool SharedDataPlaneMapping::openWorker (const SharedMemoryNames& namesToUse, juce::String& error)
{
    close();
    error.clear();
    if (! namesToUse.isValid())
    {
        error = "invalid live-worker mapping names";
        return false;
    }

#if JUCE_WINDOWS
    resourceNames = namesToUse;
    mappingHandle = OpenFileMappingW (FILE_MAP_ALL_ACCESS, FALSE,
                                      resourceNames.mapping.toWideCharPointer());
    if (mappingHandle == nullptr)
    {
        error = windowsError ("could not open plug-in shared memory");
        close();
        return false;
    }
    mappedMemory = MapViewOfFile (handleOf (mappingHandle), FILE_MAP_ALL_ACCESS, 0, 0, 0);
    if (mappedMemory == nullptr)
    {
        error = windowsError ("could not map worker shared memory");
        close();
        return false;
    }
    mappedBytes = mappedRegionBytes (mappedMemory);
    if (mappedBytes < sizeof (DataPlaneHeader))
    {
        error = "plug-in shared-memory region is too short";
        close();
        return false;
    }

    inputEventHandle = OpenEventW (SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE,
                                   resourceNames.inputReady.toWideCharPointer());
    outputEventHandle = OpenEventW (SYNCHRONIZE | EVENT_MODIFY_STATE, FALSE,
                                    resourceNames.outputReady.toWideCharPointer());
    if (inputEventHandle == nullptr || outputEventHandle == nullptr)
    {
        error = windowsError ("could not open plug-in wake events");
        close();
        return false;
    }

    plane = DataPlaneView::attach (mappedMemory, mappedBytes);
    if (! plane)
    {
        error = "plug-in worker refused the shared-memory layout";
        close();
        return false;
    }
    return true;
#else
    juce::ignoreUnused (namesToUse);
    error = "live plug-in worker mappings are currently implemented for Windows only";
    return false;
#endif
}

void SharedDataPlaneMapping::close() noexcept
{
#if JUCE_WINDOWS
    if (mappedMemory != nullptr)
        UnmapViewOfFile (mappedMemory);
    if (outputEventHandle != nullptr)
        CloseHandle (handleOf (outputEventHandle));
    if (inputEventHandle != nullptr)
        CloseHandle (handleOf (inputEventHandle));
    if (mappingHandle != nullptr)
        CloseHandle (handleOf (mappingHandle));
#endif
    mappingHandle = nullptr;
    inputEventHandle = nullptr;
    outputEventHandle = nullptr;
    mappedMemory = nullptr;
    mappedBytes = 0;
    plane = {};
    resourceNames = {};
}

bool SharedDataPlaneMapping::signalInputReady() const noexcept
{
#if JUCE_WINDOWS
    return inputEventHandle != nullptr && SetEvent (handleOf (inputEventHandle)) != FALSE;
#else
    return false;
#endif
}

bool SharedDataPlaneMapping::signalOutputReady() const noexcept
{
#if JUCE_WINDOWS
    return outputEventHandle != nullptr && SetEvent (handleOf (outputEventHandle)) != FALSE;
#else
    return false;
#endif
}

WaitResult SharedDataPlaneMapping::waitForInput (int timeoutMs) const noexcept
{
#if JUCE_WINDOWS
    return waitFor (inputEventHandle, timeoutMs);
#else
    juce::ignoreUnused (timeoutMs);
    return WaitResult::failed;
#endif
}

WaitResult SharedDataPlaneMapping::waitForOutput (int timeoutMs) const noexcept
{
#if JUCE_WINDOWS
    return waitFor (outputEventHandle, timeoutMs);
#else
    juce::ignoreUnused (timeoutMs);
    return WaitResult::failed;
#endif
}

} // namespace ceditor::host::plugin_worker
