#pragma once

#include "PluginWorkerDataPlane.h"

// Owns the Windows named mapping and the two auto-reset wake events used by one live plug-in
// worker. No wait is required on Hostage's audio thread: it reads a completed sequence if one is
// available, publishes the next slot, and signals inputReady. The worker may block on inputReady;
// its failure cannot block the host process.

namespace ceditor::host::plugin_worker
{

struct SharedMemoryNames
{
    juce::String mapping;
    juce::String inputReady;
    juce::String outputReady;
    juce::String controlPipe;

    static SharedMemoryNames createUnique();
    bool isValid() const noexcept;
};

enum class WaitResult
{
    signalled,
    timedOut,
    failed
};

class SharedDataPlaneMapping
{
public:
    SharedDataPlaneMapping() = default;
    ~SharedDataPlaneMapping();

    SharedDataPlaneMapping (SharedDataPlaneMapping&&) noexcept;
    SharedDataPlaneMapping& operator= (SharedDataPlaneMapping&&) noexcept;

    SharedDataPlaneMapping (const SharedDataPlaneMapping&) = delete;
    SharedDataPlaneMapping& operator= (const SharedDataPlaneMapping&) = delete;

    /** Creates and initialises a host-owned mapping. Every name must be unique; accidentally
        attaching to a stale mapping is treated as failure rather than recovery. */
    bool createHost (const SharedMemoryNames&, const DataPlaneConfig&, juce::uint32 generation,
                     juce::String& error);

    /** Opens an existing host mapping from the worker process and validates its complete header. */
    bool openWorker (const SharedMemoryNames&, juce::String& error);

    void close() noexcept;
    bool isOpen() const noexcept { return static_cast<bool> (plane); }
    DataPlaneView dataPlane() const noexcept { return plane; }
    const SharedMemoryNames& names() const noexcept { return resourceNames; }

    bool signalInputReady() const noexcept;
    bool signalOutputReady() const noexcept;
    WaitResult waitForInput (int timeoutMs) const noexcept;
    WaitResult waitForOutput (int timeoutMs) const noexcept;

private:
    void moveFrom (SharedDataPlaneMapping&&) noexcept;

    SharedMemoryNames resourceNames;
    void* mappingHandle = nullptr;
    void* inputEventHandle = nullptr;
    void* outputEventHandle = nullptr;
    void* mappedMemory = nullptr;
    size_t mappedBytes = 0;
    DataPlaneView plane;
};

} // namespace ceditor::host::plugin_worker
