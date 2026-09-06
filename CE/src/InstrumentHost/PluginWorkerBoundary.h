#pragma once

// Small type-erased boundary shared with the host service and rack guard. They deliberately know
// nothing about named pipes or shared memory: the service can ask an isolated worker to prepare
// its editor once normal loading is finished, and the guard can terminate a worker after an audio
// failure. Keeping this interface header-only avoids coupling rack tests to the concrete proxy.

namespace ceditor::host
{

struct PluginWorkerBoundary
{
    virtual ~PluginWorkerBoundary() = default;
    virtual bool workerIsRunning() const noexcept = 0;
    virtual void terminateWorker() noexcept = 0;
    /** Schedules hidden editor construction only after control traffic has been quiet for the
        requested interval. Returns false when the caller should retry later. */
    virtual bool prewarmEditorIfIdle (int) noexcept { return true; }
};

} // namespace ceditor::host
