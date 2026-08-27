// PluginScannerCoordinatorTests — the out-of-process scan loop (VIP-successor Stage 1).
//
// Driven against the stub worker (ScannerStubMain.cpp), whose path arrives as argv[1] from
// CTest, so every hostile worker behaviour — hang, death, garbage, reported error — runs on
// any machine with no real VST3 and no juce_audio_processors. What is being proven:
//
//   One bad module cannot stop the pass.   The scan records the failure and continues.
//   Violence quarantines immediately.      A crash or hang is not retried unprompted; a
//                                          reported error gets a second try first.
//   Nothing is scanned twice for free.     Unchanged fingerprints and quarantined modules
//                                          are skipped, and the counts say which was which.
//   The dead-man marker tells the truth.   Present exactly while a job is on the plate.
//
// The "module paths" here are plain temp files whose names steer the stub; the coordinator
// only fingerprints them and hands them over, so nothing more real is required.

#include "InstrumentHost/PluginScannerCoordinator.h"
#include <iostream>

namespace
{
int failures = 0;

void check (bool cond, const juce::String& label)
{
    std::cout << (cond ? "  PASS  " : "  FAIL  ") << label << std::endl;
    if (! cond) ++failures;
}

using ceditor::host::PluginCatalog;
using ceditor::host::PluginScannerCoordinator;
using Status = PluginScannerCoordinator::JobStatus;

juce::File testRoot()
{
    return juce::File::getSpecialLocation (juce::File::tempDirectory)
               .getChildFile ("ceditor-scanner-tests");
}

juce::String makeModule (const juce::String& name)
{
    auto f = testRoot().getChildFile (name);
    f.getParentDirectory().createDirectory();
    f.replaceWithText ("pretend module: " + name);
    return f.getFullPathName();
}

PluginScannerCoordinator makeCoordinator (const juce::File& stub, int timeoutMs = 5000)
{
    PluginScannerCoordinator::Options options;
    options.workerExecutable = stub;
    options.markerDirectory  = testRoot().getChildFile ("markers");
    options.perModuleTimeoutMs = timeoutMs;
    return PluginScannerCoordinator (options);
}

void testJobOutcomes (const juce::File& stub)
{
    std::cout << "\nrunOneJob classification" << std::endl;

    auto coordinator = makeCoordinator (stub, 1000);

    const auto ok = coordinator.runOneJob (makeModule ("Fine.vst3"));
    check (ok.status == Status::ok, "a clean worker run is ok");
    check (ok.result.classes.size() == 2, "and carries every exposed class");
    check (ok.result.classes[0].ceId == "VST3-stub-synth-1"
             && ok.result.classes[0].isInstrument
             && ok.result.classes[0].vendor == "Stub Audio",
           "class records read identity, vendor and kind from the worker document");

    const auto hung = coordinator.runOneJob (makeModule ("hang.vst3"));
    check (hung.status == Status::timedOut, "a hanging worker is killed and reported as timeout");

    const auto crashed = coordinator.runOneJob (makeModule ("crash.vst3"));
    check (crashed.status == Status::crashed, "a dead worker with no output is a crash");

    const auto garbage = coordinator.runOneJob (makeModule ("garbage.vst3"));
    check (garbage.status == Status::badOutput, "exit 0 with unparseable output is badOutput");

    const auto reported = coordinator.runOneJob (makeModule ("error.vst3"));
    check (reported.status == Status::reportedError, "an ERROR document is a reported error");
    check (reported.detail.contains ("stub reported error"), "carrying the worker's message");

    auto broken = makeCoordinator (juce::File ("/nonexistent/worker-binary"));
    const auto unlaunchable = broken.runOneJob (makeModule ("Fine.vst3"));
    check (unlaunchable.status == Status::launchFailed, "an unlaunchable worker is launchFailed");
}

void testScanLoop (const juce::File& stub)
{
    std::cout << "\nscanModules" << std::endl;

    auto coordinator = makeCoordinator (stub, 1000);
    PluginCatalog catalog;

    juce::StringArray paths;
    paths.add (makeModule ("First.vst3"));
    paths.add (makeModule ("crash.vst3"));
    paths.add (makeModule ("Second.vst3"));

    const auto first = coordinator.scanModules (paths, catalog);
    check (first.scanned == 2 && first.failed == 1,
           "one crashing module does not stop the pass");
    check (catalog.findModule (paths[1]) != nullptr
             && catalog.findModule (paths[1])->quarantined,
           "a crash quarantines immediately");
    check (catalog.instrumentClasses().size() == 2,
           "both healthy modules contribute their instrument class");

    const auto second = coordinator.scanModules (paths, catalog);
    check (second.scanned == 0 && second.skippedUnchanged == 2 && second.skippedQuarantined == 1,
           "a repeat pass skips unchanged and quarantined modules");

    juce::File (paths[0]).replaceWithText ("pretend module: First.vst3, updated");
    const auto third = coordinator.scanModules (paths, catalog);
    check (third.scanned == 1 && third.skippedUnchanged == 1,
           "a changed fingerprint rescans just that module");

    juce::StringArray withoutSecond;
    withoutSecond.add (paths[0]);
    withoutSecond.add (paths[1]);
    coordinator.scanModules (withoutSecond, catalog);
    const auto* gone = catalog.findModule (paths[2]);
    check (gone != nullptr && gone->missing,
           "a module absent from the pass is marked missing, not deleted");
}

void testErrorQuarantineThreshold (const juce::File& stub)
{
    std::cout << "\nreported-error quarantine threshold" << std::endl;

    auto coordinator = makeCoordinator (stub, 1000);
    PluginCatalog catalog;

    juce::StringArray paths;
    paths.add (makeModule ("error.vst3"));

    coordinator.scanModules (paths, catalog);
    const auto* afterFirst = catalog.findModule (paths[0]);
    check (afterFirst != nullptr && afterFirst->failureCount == 1 && ! afterFirst->quarantined,
           "the first reported error is recorded but not quarantined");

    // The fingerprint has not changed, but an unquarantined failure retries on every pass
    // (PluginCatalog::needsRescan) — which is exactly what walks it into the threshold:
    coordinator.scanModules (paths, catalog);
    const auto* afterSecond = catalog.findModule (paths[0]);
    check (afterSecond != nullptr && afterSecond->failureCount == 2 && afterSecond->quarantined,
           "the second consecutive reported error quarantines");

    catalog.clearQuarantine (paths[0]);
    const auto retried = coordinator.scanModules (paths, catalog);
    check (retried.failed == 1 && catalog.findModule (paths[0])->failureCount == 1,
           "clearQuarantine re-arms the module for a fresh manual retry");
}

void testDeadManMarker (const juce::File& stub)
{
    std::cout << "\ndead-man marker" << std::endl;

    const auto markerDir = testRoot().getChildFile ("markers");

    auto coordinator = makeCoordinator (stub, 1000);
    PluginCatalog catalog;
    juce::StringArray paths;
    paths.add (makeModule ("crash.vst3"));
    coordinator.scanModules (paths, catalog);

    check (PluginScannerCoordinator::pendingMarkerModule (markerDir).isEmpty(),
           "a completed pass leaves no marker, even after a worker crash");

    PluginScannerCoordinator::markerFile (markerDir).replaceWithText ("C:\\VST3\\Suspect.vst3");
    check (PluginScannerCoordinator::pendingMarkerModule (markerDir) == "C:\\VST3\\Suspect.vst3",
           "a leftover marker names the suspect module for startup to quarantine");
    PluginScannerCoordinator::markerFile (markerDir).deleteFile();
}

void testArchitectureIsCheckedBeforeLaunching (const juce::File& stub)
{
    std::cout << "\nthe architecture check runs before the worker (§17.1)" << std::endl;

    auto coordinator = makeCoordinator (stub, 1000);
    PluginCatalog catalog;

    const auto host = PluginCatalog::hostArchitecture();
    const auto wrong = host == "x86" ? juce::String ("x86_64-win") : juce::String ("x86-win");
    const auto right = host == "x86" ? juce::String ("x86-win")    : juce::String ("x86_64-win");

    // The wrong-architecture module is deliberately named the way the stub worker recognises as
    // "crash". If it ever reaches the worker the pass will report a failure and a quarantine —
    // which is exactly the outcome the check exists to prevent, so the name IS the assertion.
    // Its own directory: earlier tests in this file already made plain files with these names
    // at the root, and a bundle cannot be created where a file already sits.
    const auto makeBundle = [] (const juce::String& name, const juce::String& slice)
    {
        const auto bundle = testRoot().getChildFile ("arch-check").getChildFile (name);
        const auto dir = bundle.getChildFile ("Contents").getChildFile (slice);
        dir.createDirectory();
        dir.getChildFile (name).replaceWithText ("binary");
        return bundle.getFullPathName();
    };

    juce::StringArray paths;
    paths.add (makeBundle ("crash.vst3", wrong));
    paths.add (makeBundle ("Native.vst3", right));

    const auto outcome = coordinator.scanModules (paths, catalog);

    check (outcome.skippedUnsupported == 1, "the wrong-architecture module is skipped");
    check (outcome.failed == 0,
           "and never reaches the worker — a launch would have crashed and been counted");
    check (outcome.scanned == 1, "the native module is scanned normally");

    const auto* rejected = catalog.findModule (paths[0]);
    check (rejected != nullptr, "the skipped module is still catalogued");
    check (rejected != nullptr && ! rejected->quarantined,
           "and is not quarantined, because nothing failed");
    check (rejected != nullptr && rejected->unavailableReason().isNotEmpty(),
           "the reason it is not on offer is recorded");
    check (catalog.instrumentClasses().size() == 1,
           "only the loadable module reaches the browser");

    // Repeating the pass must reach the same conclusion rather than trying it once more.
    const auto again = coordinator.scanModules (paths, catalog);
    check (again.skippedUnsupported == 1 && again.failed == 0,
           "a repeat pass reaches the same conclusion without a launch");
}

void testEnumeration()
{
    std::cout << "\nenumerateVst3Candidates" << std::endl;

    const auto root = testRoot().getChildFile ("enumerate");
    root.deleteRecursively();

    root.getChildFile ("Vendor").createDirectory();
    root.getChildFile ("Plain.vst3").replaceWithText ("x");
    root.getChildFile ("Vendor").getChildFile ("Nested.vst3").replaceWithText ("x");
    root.getChildFile ("Vendor").getChildFile ("readme.txt").replaceWithText ("x");

    const auto bundle = root.getChildFile ("Bundle.vst3");
    bundle.getChildFile ("Contents").createDirectory();
    bundle.getChildFile ("Contents").getChildFile ("Inner.vst3").replaceWithText ("trap");

    juce::Array<juce::File> roots;
    roots.add (root);
    const auto found = PluginScannerCoordinator::enumerateVst3Candidates (roots);

    check (found.size() == 3, "finds files and bundle directories, recursively");
    check (found.contains (bundle.getFullPathName()), "a bundle directory is a candidate");
    check (! found.contains (bundle.getChildFile ("Contents").getChildFile ("Inner.vst3")
                                   .getFullPathName()),
           "and nothing inside a bundle is walked into");

    root.deleteRecursively();
}
} // namespace

int main (int argc, char* argv[])
{
    if (argc != 2)
    {
        std::cout << "usage: CEditorPluginScannerCoordinatorTests <path-to-CEditorScannerStub>" << std::endl;
        return 64;
    }

    const juce::File stub (juce::String::fromUTF8 (argv[1]));
    if (! stub.existsAsFile())
    {
        std::cout << "stub worker not found: " << stub.getFullPathName() << std::endl;
        return 64;
    }

    std::cout << "PluginScannerCoordinator tests (stub: " << stub.getFullPathName() << ")" << std::endl;

    testRoot().deleteRecursively();

    testJobOutcomes (stub);
    testScanLoop (stub);
    testErrorQuarantineThreshold (stub);
    testDeadManMarker (stub);
    testArchitectureIsCheckedBeforeLaunching (stub);
    testEnumeration();

    testRoot().deleteRecursively();

    std::cout << (failures == 0 ? "\nALL PASSED" : "\nFAILURES: " + std::to_string (failures)) << std::endl;
    return failures == 0 ? 0 : 1;
}
