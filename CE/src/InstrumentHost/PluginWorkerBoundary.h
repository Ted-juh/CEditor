#pragma once

// Small type-erased boundary shared with the rack guard. The guard deliberately knows nothing
// about named pipes or shared memory; it only needs a control-thread way to terminate a worker
// that the audio thread has already marked failed. Keeping this interface header-only avoids
// coupling every rack test target to the concrete proxy implementation.

namespace ceditor::host
{

struct PluginWorkerBoundary
{
    virtual ~PluginWorkerBoundary() = default;
    virtual bool workerIsRunning() const noexcept = 0;
    virtual void terminateWorker() noexcept = 0;
};

} // namespace ceditor::host
