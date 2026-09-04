#pragma once

#include "PluginCatalog.h"
#include <functional>

// PluginScannerCoordinator — runs the out-of-process VST3 scan (VIP-successor Stage 1).
//
// VST3 modules are third-party executable code, so the editor process never loads one to ask
// what it contains. The coordinator hands each module to a helper executable
// (CEditorPluginScanner, one clearly identified module per job), waits with a timeout, and
// classifies what came back. A crash or hang costs one short-lived child process and gets
// attributed to exactly one module; the scan then continues with the next.
//
// The worker protocol is one XML document on stdout:
//
//   <SCANRESULT module="C:\...\Thing.vst3">
//     <PLUGIN name="..." manufacturer="..." version="..." category="..."
//             isInstrument="1" ceId="VST3-..." ... />   (JUCE PluginDescription XML + ceId)
//   </SCANRESULT>
//
// or <SCANRESULT ...><ERROR message="..."/></SCANRESULT> with a nonzero exit for a failure the
// worker could still report. Exit code 0 with a parseable document is the only success. The
// document stays far below pipe capacity, which is what lets runOneJob use the simple
// wait-then-read shape below instead of incremental pipe draining.
//
// THE DEAD-MAN MARKER is for the coordinator's own process dying, not the worker's: before a
// job launches, the module's path is written to scan-active.marker in the marker directory,
// and it is removed once the outcome is recorded. After an abnormal editor termination,
// pendingMarkerModule() names the module that was on the plate so startup can quarantine it
// instead of walking into the same wall.
//
// Quarantine policy lives here, storage lives in the catalogue: a crash or timeout quarantines
// immediately (the module just took a process down — retrying it unprompted is hostile), while
// reported errors and garbage output quarantine only after repeating, since they can be a
// licence dialog's collateral or a transient. juce_core only — tests drive this against a stub
// worker on any machine.

namespace ceditor::host
{

class PluginScannerCoordinator
{
public:
    struct Options
    {
        juce::File workerExecutable;
        juce::File markerDirectory;
        int perModuleTimeoutMs = 30'000;
        int failuresBeforeQuarantine = 2;                 // for non-crash failures
        std::function<void (const juce::String&)> log;    // optional progress sink
        std::function<bool()> shouldContinue;             // optional; checked between modules so
                                                          // a shutdown does not wait out a scan
    };

    explicit PluginScannerCoordinator (Options optionsToUse);

    enum class JobStatus
    {
        ok,             // exit 0, parseable SCANRESULT
        timedOut,       // killed after perModuleTimeoutMs
        crashed,        // process died: nonzero exit and no parseable document
        reportedError,  // worker delivered an ERROR document
        badOutput,      // exit 0 but stdout was not a SCANRESULT
        launchFailed    // the worker process could not be started
    };

    struct JobResult
    {
        JobStatus status = JobStatus::launchFailed;
        ModuleScanResult result;   // filled for ok
        juce::String detail;       // failure reason / error message
    };

    /** One module through the worker, blocking. Exposed for tests; scanModules is the loop. */
    JobResult runOneJob (const juce::String& modulePath);

    struct ScanOutcome
    {
        int scanned = 0;
        int skippedUnchanged = 0;
        int skippedQuarantined = 0;
        int skippedUnsupported = 0;   // wrong architecture for this host (§17.1)
        int failed = 0;
    };

    /** Marks missing modules, skips unchanged and quarantined ones, scans the rest, and
        records every outcome in the catalogue. Blocking — the caller owns threading (the
        bridge job runs this off the message thread; tests call it directly). Saving the
        catalogue is the caller's decision, after this returns. */
    ScanOutcome scanModules (const juce::StringArray& modulePaths, PluginCatalog& catalog);

    static juce::File markerFile (const juce::File& markerDirectory);

    /** The module named by a leftover dead-man marker, or empty when there is none. */
    static juce::String pendingMarkerModule (const juce::File& markerDirectory);

    /** Every .vst3 entry (file or bundle directory) under the given roots, recursively —
        without descending into a bundle. Sorted, deduplicated. */
    static juce::StringArray enumerateVst3Candidates (const juce::Array<juce::File>& roots);

    /** The standard Windows VST3 locations (baseline §8.6.5) that exist on this machine,
        before any user-added paths. */
    static juce::Array<juce::File> defaultWindowsVst3Roots();

private:
    Options options;
};

} // namespace ceditor::host
